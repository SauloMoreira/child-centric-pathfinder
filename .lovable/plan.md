# Vincular Membro de Equipe a Defensor Público + Acesso Técnico Global

Escopo ampliado: além da UI de vínculo membro↔defensor, o Administrador Técnico passa a enxergar e operar (somente leitura) o contexto de qualquer Defensor ativo — **sem** criar vínculo artificial em `member_defensor_bonds`.

## Princípios não-negociáveis

- `member_defensor_bonds` é **apenas** para `membro_equipe ↔ defensor_publico`. Nunca inserir linhas para `admin_tecnico`.
- Autorização técnica = papel `admin_tecnico` ativo + perfil ativo. Contexto nunca é fonte primária de autorização.
- Ordem do helper de acesso: **owner → technical_readonly → team_readonly → sem acesso**.
- Todas as RPCs: `SECURITY DEFINER`, `SET search_path=''`, chamadas qualificadas, `REVOKE ... FROM public/anon`, `GRANT EXECUTE TO authenticated`.

## 1. Migration única

### 1.1 Helper `private.user_workspace_access(actor uuid, defender uuid) → panel_access_mode`
Retorna `owner | technical_readonly | team_readonly | none`, na ordem acima. Usa perfil ativo + papéis + `member_defensor_bonds` + `defensor_context`. Substitui a lógica atual espalhada em `listar_area_trabalho_defensor` / `can_view_workspace`. Nenhum EXECUTE para `authenticated`.

### 1.2 Policy `member_defensor_bonds`
- Manter `select_self` (defensor OU membro).
- **Nova** `select_technical`: `private.user_is_active_admin_tecnico(auth.uid())` — leitura total para o Técnico. Sem INSERT/UPDATE/DELETE.

### 1.3 RPCs novas

- **`listar_defensores_disponiveis_contexto()`** → `[{defenderUserId, displayName, institutionalLabel, isCurrentContext}]`.
  - Técnico: todos Defensores com perfil ativo + papel `defensor_publico`.
  - Membro: apenas vínculos ativos.
  - Defensor: só o próprio.
- **`buscar_usuarios_membro_equipe(p_termo)`** — só permite se caller é Defensor ativo; senão `FORBIDDEN`. Retorna membros puros ativos (ILIKE nome/email, unaccent, LIMIT 20). Colunas mínimas.
- **`vincular_membro_defensor(p_member_user_id, p_idempotency_key)`** — só Defensor. Técnico → `FORBIDDEN`. Valida alvo é `membro_equipe` puro ativo. Idempotente. Erros: `MEMBER_NOT_FOUND`, `MEMBERSHIP_ALREADY_ACTIVE`, `FORBIDDEN`.
- **`encerrar_vinculo_membro_defensor(p_bond_id, p_expected_version, p_idempotency_key)`** — só Defensor dono. Preenche `ended_at`, `ended_by`, `status='encerrado'`, incrementa `optimistic_version`. Remove `defensor_context` do membro se apontar para esse Defensor. Erros: `MEMBERSHIP_NOT_FOUND`, `MEMBERSHIP_ALREADY_ENDED`, `CONCURRENT_CHANGE`, `FORBIDDEN`.
- **`listar_membros_do_defensor(p_defensor_user_id uuid DEFAULT NULL)`** → `{defenderUserId, accessMode:'owner'|'technical_readonly', canLinkMembers, canEndBonds, members:[...]}`.
  - Defensor: `p_defensor_user_id` opcional; se enviado ≠ próprio → `FORBIDDEN`. `canLinkMembers=true, canEndBonds=true`.
  - Técnico: `p_defensor_user_id` obrigatório; valida Defensor ativo. Ambos flags `false`.
  - Outros papéis: `FORBIDDEN`.

### 1.4 RPCs alteradas

- **`selecionar_contexto_defensor(p_defensor_user_id)`**
  - Técnico: valida Defensor ativo, grava contexto, sem exigir vínculo.
  - Membro: mantém regra (vínculo ativo). Sem vínculo → `MEMBERSHIP_NOT_FOUND`.
  - Defensor: só o próprio; outro id → `FORBIDDEN`.
- **`listar_area_trabalho_defensor`** — usar `private.user_workspace_access`; passa a devolver `accessMode='technical_readonly'` para o Técnico.
- **RPCs de mutação de painel/coluna/card** — recalcular via `user_workspace_access`; qualquer modo diferente de `owner` → `FORBIDDEN`. (`technical_readonly` bloqueia criação/edição/DnD.)

### 1.5 Auditoria
Eventos abstratos (sem PII): `defender_context.selected`, `defender_team.viewed_technical`, `member_defender_bond.created`, `member_defender_bond.ended` — metadados: actor, defender, bond, accessMode, resultado, correlationId.

## 2. Frontend

### 2.1 Novos módulos
- `src/features/team/api.ts` — wrappers das RPCs.
- `src/features/team/hooks.ts` — `useAvailableDefenders`, `useDefenderTeam(defenderUserId)`, `useLinkMember`, `useEndBond`, `useSearchMembers`.
- `src/features/team/components/LinkMemberSheet.tsx` — combobox com debounce (300ms), sucesso invalida `['defender-team', defenderId]`.
- `src/components/app-shell/defender-context-switcher.tsx` — substitui a ideia inicial de `MemberContextSwitcher`.
  - Membro: título "Trabalhando com"; estado vazio "Aguardando vínculo com um Defensor Público".
  - Técnico: título "Contexto técnico"; busca; badge fixa **MODO TÉCNICO · SOMENTE LEITURA**.
  - Defensor: não renderiza.
- `src/lib/team-errors.ts` — adiciona `MEMBER_NOT_FOUND`, `DEFENDER_NOT_FOUND`, `MEMBERSHIP_*`, `FORBIDDEN`, `CONCURRENT_CHANGE` em PT-BR.

### 2.2 Rota `/minha-equipe`
- Se caller é Técnico e não há `defenderContext`, mostrar estado "Selecione um Defensor no seletor lateral".
- Botão **"+ Vincular membro"** e ação **"Encerrar vínculo"** só aparecem quando `canLinkMembers`/`canEndBonds` do payload for `true`.
- Header do modo técnico exibe nome do Defensor + chip "somente leitura".
- Backend continua validando; UI é apenas espelho.

### 2.3 Área de Trabalho
- Query key inclui `defensorUserId` (não órgão): `['work-area', defensorUserId]`.
- Ao trocar contexto: `queryClient.cancelQueries(['work-area'])` + `removeQueries` do antigo antes de setar o novo; skeleton enquanto carrega.
- Botões de criar/renomear/arquivar painel, criar coluna, mover card etc. respeitam `access.canManagePanels/Columns/MoveCards/AddItems` (já vindos do backend com `technical_readonly=false`).

## 3. Bootstrap E2E (após Auth criado pelo usuário)

Insert pontual: perfil ativo `e2e-team-readonly`, papel exclusivo `membro_equipe`, `member_defensor_bonds` ativo com Lucas, `defensor_context` apontando para Lucas. Sem tocar contas admin_tecnico/defensor. Verificar `accessMode='team_readonly'` via query.

## 4. Testes

- **Vitest**: mapping de erros; hooks `useAvailableDefenders`/`useDefenderTeam` (mock `supabase.rpc`) para cada perfil.
- **Playwright (specs preparadas, execução condicionada ao bootstrap E2E existente)**:
  - Técnico lista todos, troca contexto, abre `/area-de-trabalho`, botões de mutação ausentes, `technical_readonly` badge visível.
  - Membro sem vínculo → estado vazio; com vínculo → `team_readonly`.
  - Defensor gerencia própria equipe; tentativa cross-defensor bloqueada.
- **SQL smoke** (via `supabase--read_query`): `listar_area_trabalho_defensor` para cada persona retorna `accessMode` correto; nenhum registro de `admin_tecnico` em `member_defensor_bonds`.

## 5. Entregáveis

Migration, RPCs, matriz de permissões, seletor de Defensores, tela Minha equipe adaptada, policies/grants, resultado de typecheck + build + lint, confirmação: **nenhum vínculo artificial criado para o Técnico**.

## Fora de escopo

- Rota "Administração → Vínculos" (a operação obrigatória já cabe em Minha equipe).
- Capacidade administrativa do Técnico para criar/encerrar vínculos em nome do Defensor (deve ser feature separada, auditada).
- Reformulação da listagem por órgão em Minha equipe (mantida como está).
