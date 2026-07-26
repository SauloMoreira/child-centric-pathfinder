## Múltiplos vínculos de Defensor + contexto operacional por órgão

Reescreve o modelo institucional para separar **vínculo** (autorização) de **contexto operacional** (órgão em uso agora), permitindo N Defensores por órgão e N órgãos por Defensor, com seletor no cabeçalho.

### Diagnóstico confirmado
- `private.user_org_memberships` usa `orgao_id`, `ativo`, `since/until`, `granted_by/ended_by` — ainda **não** tem `tipo_vinculo`.
- Índice `user_org_memberships_one_active_per_user UNIQUE(user_id) WHERE ativo` — bloqueia múltiplos vínculos, **precisa ser removido**.
- `private.current_active_org_id()` retorna o único membership ativo; usado por RLS de assistidos/processos/workspaces.
- RPC `defensor_alterar_orgao_ativo` encerra+recria vínculo (destrutiva).
- `meu_estado_institucional` devolve `orgao_ativo` singular; frontend consome como campo único.
- Não existe `private.idempotency_operations` (criaremos).
- `private.audit_events.action` é texto livre (sem migration de enum).

### Migrations (numeração sequencial real após a última existente)

1. **membership_type_and_multiple_defender_memberships**
   - Cria enum `private.membership_type_enum` (`defensor`, `membro_equipe`, `administrativo`).
   - Adiciona `tipo_vinculo membership_type_enum` em `user_org_memberships` (nullable inicial).
   - Backfill: `defensor` para users com role `defensor_publico`, `membro_equipe` para `membro_equipe`, `administrativo` para demais legados.
   - `ALTER COLUMN tipo_vinculo SET NOT NULL` após validação.
   - Dropa `user_org_memberships_one_active_per_user`.
   - Cria `uq_membership_active_user_org_type (user_id, orgao_id, tipo_vinculo) WHERE ativo AND until IS NULL`.
   - Cria `uq_team_member_single_active_org (user_id) WHERE ativo AND until IS NULL AND tipo_vinculo='membro_equipe'`.
   - Corrige registros com inconsistência `ativo`/`until` antes.

2. **user_operational_context**
   - Cria `private.user_operational_context` (user_id PK, orgao_id FK RESTRICT, selected_at, selected_by FK, updated_at, version bigint).
   - Trigger `updated_at`.
   - `REVOKE ALL ... FROM public, anon, authenticated` (acesso só via funções SECURITY DEFINER).

3. **idempotency_operations**
   - Cria `private.idempotency_operations` (id, idempotency_key, operation_name, actor_user_id, request_hash, status, result jsonb, created_at, completed_at, expires_at).
   - `UNIQUE (actor_user_id, operation_name, idempotency_key)`.
   - Helper `private.claim_idempotency_v2(...)` retornando status/resultado.

4. **operational_context_security_functions**
   - `private.current_operational_org_id()` — lê contexto, revalida acessibilidade, retorna null se inválido; nunca escolhe automaticamente entre vários vínculos.
   - `private.user_can_select_org(uuid)` — regras por papel.
   - `private.user_can_access_org(uuid)` — considera membership OU papel administrativo.
   - `private.user_has_active_org_membership(user_id, orgao_id, tipo_vinculo)`.
   - Todas `SECURITY DEFINER SET search_path=''` com identificadores qualificados.
   - `current_active_org_id()` marcada como legada, reescrita para delegar a `current_operational_org_id()` **somente** em usos operacionais; usos administrativos migrados para funções novas.

5. **backfill_operational_context**
   - Para user com exatamente 1 membership ativo: cria contexto naquele órgão.
   - Defensor com N vínculos: usa `orgao_ativo` histórico se identificável; senão vínculo com `since` mais recente; senão deixa nulo.
   - Membro: contexto = único vínculo ativo.
   - Admin técnico: preserva órgão anterior se houver; senão nulo (mantém acesso admin).
   - Não encerra memberships, não altera papéis, não move dados. Emite `RAISE NOTICE` com contagens.

6. **operational_context_rpcs**
   - `public.selecionar_contexto_orgao(p_orgao_id, p_expected_version, p_idempotency_key)` — transacional, idempotente, sem MFA. Retorna `{ok, code, contextoAtual, version, correlationId}`. Erros de domínio como retorno estruturado (não `RAISE`), para preservar auditoria.
   - `public.admin_add_defensor_org_membership(p_user_id, p_orgao_id, p_idempotency_key)` — preserva outros vínculos, exigências atuais de MFA/role admin mantidas.
   - `public.admin_end_defensor_org_membership(p_membership_id, p_motivo, p_idempotency_key)` — encerra só o vínculo alvo; se era o contexto: limpa; se resta exatamente 1, seleciona; se restam vários, deixa nulo.
   - `public.admin_list_defensor_memberships(p_user_id)`.
   - Remove/marca legada `defensor_alterar_orgao_ativo` — vira wrapper que chama `selecionar_contexto_orgao` (sem encerrar vínculo).

7. **institutional_state_v2**
   - Reescreve `meu_estado_institucional` para devolver `papel`, `status`, `acessoGlobal`, `contextoAtual`, `orgaosDisponiveis` (null para admin técnico), `contextVersion`.
   - Mantém `orgao_ativo` como espelho de `contextoAtual` (compat).

8. **accessible_organizations_rpc**
   - `public.listar_orgaos_acessiveis(p_termo, p_cursor, p_limit)` — paginação por cursor keyset; retorna somente id/nome/comarcas/comarca principal/membership_id/selecionado. Limite máx 100. Escopo por papel.

9. **operational_context_rls**
   - Reescreve policies operacionais (assistidos, assistido_familiares, assistido_processos, assistido_acolhimentos, assistido_providencias, assistido_vinculos, processos, processo_assistidos, orgao_workspaces, workspace_columns) para `user_can_access_org(orgao_id) AND orgao_id = current_operational_org_id()`.
   - Remove bypasses `USING(true)` operacionais; admin técnico opera pelo contexto.
   - Mantém policies administrativas específicas (listagem admin de usuários/órgãos) inalteradas.

### Frontend

- **`src/lib/institutional/keys.ts`** — fábricas `institutionalKeys`, `workspaceKeys(orgaoId)`, `assistidoKeys(orgaoId)`, `processoKeys(orgaoId)`, `equipeKeys(orgaoId)`, `documentoKeys(orgaoId)`.
- **`use-estado-institucional.ts`** — novo tipo `EstadoInstitucional` (papel/status/acessoGlobal/contextoAtual/orgaosDisponiveis/contextVersion). Mantém `orgao_ativo` legado.
- **`use-selecionar-contexto-orgao.ts`** — chama a RPC; cancela/remove **apenas** query keys operacionais do órgão anterior (via predicate por prefixo com orgaoId antigo); invalida router; refetch estado; toast; UUID de idempotência por clique.
- **`use-orgaos-acessiveis.ts`** — infinite query paginada; enabled só quando `open`.
- **`src/components/app-shell/operational-org-switcher.tsx`** — botão compacto no header (badge com Building2 + nome + comarca principal). Popover + Command com busca (nome/comarca). Estados: único órgão (badge estático), sem vínculos (mensagem orientativa), admin técnico (badge "ACESSO GLOBAL" + busca global paginada). Check no atual, "Em uso".
- **`app-shell.tsx`** — insere switcher no header (direita do breadcrumb), badge global do admin técnico, skeleton via `React.Suspense`/loading key quando `contextVersion` muda; sidebar recolhível preservada.
- **`conta.tsx`** — nova seção "Órgãos vinculados": lista com nome/comarcas/data início/status/"Em uso" + botão "Usar este órgão". Remove ChangeOrgSheet destrutivo (mantém arquivo apenas se usado noutro fluxo; caso contrário, remoção).
- **`use-workspace.ts` + cadastros** — troca `orgaoId` local pelo `contextoAtual.orgaoId`; queries `enabled` apenas quando há contexto; passam a usar as novas fábricas de keys. Cadastros já derivam órgão no backend — não enviarão `orgao_id`.
- **`alterar-orgao.tsx`** — redirect para `/conta` (já é stub); remover link/menções.
- **Textos** — substituir "Alterar órgão de execução" por "Selecionar órgão de trabalho"; remover avisos de perda de vínculo em toda a UI.

### Segurança/invariantes
- Nenhum vínculo apagado; nenhum papel alterado; nenhum dado movido.
- `SECURITY DEFINER` + `search_path=''` com nomes qualificados.
- Erros de domínio como retorno estruturado (não `RAISE`) para não perder auditoria.
- Frontend nunca envia `orgao_id` divergente do contexto.
- Cancelamento de queries por predicate (evita `cancelQueries()` sem filtro).

### Verificação
- `supabase--linter` após cada migration.
- `psql` para confirmar novos índices e drop do antigo.
- Build/typecheck automáticos.
- Smoke: login como `saulocmoreira@gmail.com`, criar 2º vínculo via RPC admin, alternar contexto, confirmar isolamento de dados.

### Fora do escopo
- Tela administrativa dedicada de gestão de vínculos (RPCs ficarão prontas).
- Mudar regra de Membro de Equipe.
- Encerrar vínculo pela "Minha conta".
- Realtime/WebSocket.

---

**Ordem de execução:** aplico as migrations 1→9 em série (validando cada uma), depois entrego o frontend em um único bloco coerente. Custo alto de tokens/tempo — confirme para prosseguir.