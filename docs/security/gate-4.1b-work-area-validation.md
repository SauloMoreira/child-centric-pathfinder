# Sub-gate 4.1.b — Área de Trabalho e Painéis (validação)

**Status parcial:** 🟡 Bloco A + Bloco B.1 concluídos — B.2/C/D pendentes.
**Data:** 2026-07-27
**Escopo:** Autorização, integridade e cleanup do domínio de Painéis do Defensor
(tabelas `public.defensor_workspaces`, `public.defensor_workspace_columns`,
`public.defensor_workspace_cards` e RPCs `public.*_painel`, `*_workspace*`).

## Arquitetura dos Painéis

Um Defensor possui **1 a 8 Painéis ativos**. Cada Painel possui uma coleção
independente de colunas e cards. Cards apontam para `content_items`
(Atendimentos/Cotas). Não há armazenamento de PII na Área de Trabalho.

```text
Defensor
└── Painéis ativos (1..8)
    └── Colunas
        └── Cards → content_items (Atendimento | Cota)
```

## Modelo de autorização

Aplicado pelo helper `private.user_workspace_access(actor, panel_id)` — a
autorização depende **exclusivamente** do Painel + identidade do chamador:

| Modo                  | Origem                                                      | Permissões                              |
|-----------------------|-------------------------------------------------------------|-----------------------------------------|
| `owner`               | Defensor proprietário do Painel                             | Leitura + todas as mutações do Painel   |
| `team_readonly`       | Membro com vínculo ativo **e** contexto para esse Defensor  | Somente leitura                         |
| `technical_readonly`  | `admin_tecnico`                                             | Somente leitura                         |
| `none`                | Qualquer outro (inclui outro Defensor, inativo, `anon`)     | Bloqueia — 42501/FORBIDDEN              |

Nenhuma decisão de autorização depende de `orgao_id` ou de
`current_operational_org_id()`. A coluna `orgao_id` permanece em
`defensor_workspaces` **apenas como metadado** (FK histórica).

## RPCs canônicas mantidas

Todas com `SECURITY DEFINER`, `SET search_path = ''`,
`REVOKE ... FROM PUBLIC, anon` e `GRANT EXECUTE ... TO authenticated`.

| RPC                                     | Contrato                                          |
|-----------------------------------------|---------------------------------------------------|
| `listar_area_trabalho_defensor(uuid)`   | Leitura da Área — lista Painéis + acesso          |
| `listar_workspace_completo(uuid)`       | Leitura de **um** Painel por `panel_id`           |
| `ensure_defensor_work_area(uuid,uuid)`  | Idempotente; cria Painel inicial se necessário    |
| `criar_painel(...)`                     | Cria Painel (respeita limite de 8, expected_count)|
| `renomear_painel(...)`                  | Renomeia com `expected_version`                   |
| `reordenar_paineis_defensor(...)`       | Reordena com versão por Painel                    |
| `arquivar_painel(...)`                  | Arquiva; não permite último Painel ativo          |
| `criar_coluna_workspace(...)`           | Cria coluna com `expected_workspace_version`      |
| `atualizar_coluna_workspace(...)`       | Renomeia/cor da coluna                            |
| `mover_coluna_workspace(...)`           | Move para esquerda/direita                        |
| `reordenar_colunas_workspace(uuid,uuid[],bigint,uuid)` | Reordena colunas por array + versão   |
| `excluir_coluna_workspace(...)`         | Exclui, exigindo destino se houver cards          |
| `adicionar_card_workspace(...)`         | Adiciona `item_id` a uma coluna                   |
| `mover_card_workspace(...)`             | Move card (intra ou entre colunas do Painel)      |
| `remover_card_workspace(...)`           | Remove placement do card (não apaga o item)       |

## Índices

Todos preservados; nenhum depende de `orgao_id` como identidade:

- `defensor_workspaces_pkey` — chave primária.
- `defensor_workspaces_active_idx (defensor_user_id, order_position) WHERE archived_at IS NULL` — leitura ordenada da Área.
- `uq_active_panel_name_per_defender (defensor_user_id, nome_normalizado) WHERE archived_at IS NULL` — unicidade de nome ativo.
- `uq_active_panel_position_per_defender (defensor_user_id, order_position) WHERE archived_at IS NULL` — unicidade de posição ativa.
- `defensor_workspace_columns_*` — pk, `(workspace_id, order_position)` (ord. + unicidade), `(id, workspace_id)` (FK composta).
- `defensor_workspace_cards_*` — pk, `(column_id, order_position)` (ord. + unicidade), `(workspace_id, item_id)` (item único por Painel).

## RLS

Policies das três tabelas verificadas — sem referência a `orgao_id` e sem
`USING (true)`:

- `defensor_workspaces_select` → `private.can_view_workspace(auth.uid(), id)`.
- `defensor_workspace_columns_select` → EXISTS Painel (leitura via cadeia de acesso).
- `defensor_workspace_cards_select` → EXISTS Coluna (leitura via cadeia).
- **Nenhuma policy** para `INSERT/UPDATE/DELETE`: mutações ocorrem só via RPC
  `SECURITY DEFINER`.

## Grants (verificados via `information_schema.role_table_grants`)

Nas três tabelas:

- `anon`: **nenhum** privilégio (nem `SELECT`, nem `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`).
- `authenticated`: **nenhum grant direto** de tabela — leituras ocorrem por
  RPC. As policies existem como reforço defensivo caso um SELECT direto
  seja autorizado no futuro.
- `service_role`: `ALL` (padrão da plataforma; não é utilizado pelo app).

## Cleanup legado (migration `defender_panels_legacy_rpc_cleanup`)

Removidos (assinaturas exatas, sem `CASCADE`):

- `public.ensure_defensor_workspace(uuid, uuid)` — sem consumidor ativo.
- `public.atualizar_workspace_defensor(uuid, bigint, uuid, text, text)` — sem consumidor ativo.
- `public.reordenar_colunas_workspace(uuid, uuid[])` — versão legada de 2
  argumentos (dependia de `orgao_id` via `assert_can_act_for_defensor`).

Refatorados:

- `public.listar_workspace_completo(uuid, uuid)` → substituído por
  **`public.listar_workspace_completo(uuid)`**. Agora exige `p_panel_id`
  explicitamente; falha com `PANEL_ID_REQUIRED` ou `PANEL_NOT_FOUND` em vez
  de selecionar Painel implícito. Autorização segue `user_workspace_access`.
  O nome físico da função permanece por continuidade — a semântica é do
  Painel.

## Frontend — mudanças alinhadas

- `src/lib/reintegra-api.ts`: exports `ensureDefensorWorkspace` e
  `atualizarWorkspaceDefensor` removidos. `listarWorkspaceCompleto` agora
  envia apenas `p_panel_id`; o parâmetro `defensorUserId` foi mantido para
  compat local (usado em query keys) mas não é enviado ao backend.
- Sensores `PointerSensor + KeyboardSensor` com `sortableKeyboardCoordinates`
  ativos nos três níveis DnD:
  - Painéis — `PanelTabs.tsx`
  - Colunas — `area-de-trabalho.tsx` (linha ~479)
  - Cards — mesmo `DndContext`, isolado por coluna via `SortableContext`

## Verificações realizadas neste bloco

| Comando                                            | Resultado |
|----------------------------------------------------|-----------|
| Preflight `rg` por 14 símbolos legados             | ✅ 0 consumidores ativos remanescentes |
| `psql` — inspeção de `pg_proc` (RPCs)              | ✅ 20 → 17 RPCs; assinaturas duplicadas removidas |
| `psql` — inspeção de `pg_policies` (3 tabelas)     | ✅ 0 referência a `orgao_id` |
| `psql` — grants (3 tabelas)                        | ✅ `anon` sem privilégios; `authenticated` sem mutação direta |
| Supabase linter (pós-migration)                    | 77 alertas — todos já classificados (ver 4.1.a) |
| `tsgo --noEmit`                                    | ✅ verde |
| ESLint dos 4 arquivos tocados                      | ✅ verde |
| Prettier dos 4 arquivos tocados                    | ✅ verde |

## Pendências dos blocos seguintes

- **3.C.3.b** — Vitest + Testing Library; testes unitários (`mapPanelRow`,
  `parseDragId`, query keys, permissões, rollback) e de componentes
  (`PanelTabs`, colunas, cards).
- **3.C.3.c** — Playwright configurado; fluxos Owner/Membro/Admin Técnico;
  acessibilidade completa (foco, `aria-live`, teclado); validação visual
  nas 5 resoluções especificadas.
- **3.C.3.d** — Suíte SQL de autorização/integridade/concorrência com
  **duas conexões independentes** para os cenários de 8º/9º Painel,
  reorder, move card e exclusão de coluna.

## Risco residual

- Baseline ESLint/Prettier global ainda contém arquivos não formatados
  fora do escopo do Bloco A — nenhum novo erro foi introduzido. Não foi
  aplicada formatação global cega.
- `pg_trgm` permanece em `public` (herdado da Fase 1 — ver Sub-gate 4.1.a).
- Testes automatizados de concorrência real permanecem para 3.C.3.d.

---

## Turno 3.C.3.c.1.a — Scaffold E2E (Playwright + Axe)

**Status:** scaffold concluído. Execução autenticada real fica reservada
para o Turno 3.C.3.c.1.b após bootstrap manual de usuários MFA.

### Dependências
- `@playwright/test@1.62.0`
- `@axe-core/playwright@4.12.1`

### Scripts (package.json)
`test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:update`,
`test:e2e:install`, `e2e:prepare`, `e2e:mint-sessions`, `e2e:validate`.

Sem `--passWithNoTests`. Nenhum spec marcado como `skip`.

### Configuração Playwright
`playwright.config.ts` define três projetos com `storageState` real:
- `chromium-desktop-1440`
- `chromium-mobile-390`
- `chromium-reduced-motion`

`webServer` aponta para `bun run dev` no `E2E_BASE_URL`. Retries: 0 local,
1 no CI. Trace on-first-retry, screenshot e vídeo apenas em falha.

### Ambiente sintético
- Seed em `scripts/e2e/seed-work-area.sql` — **fora** de `supabase/migrations/`.
- Guarda dupla: exige `app.environment = 'e2e'` (GUC externa) e o script
  **não** define a GUC para si mesmo.
- Não toca em `auth.users`, `auth.identities`, `auth.sessions`,
  `auth.refresh_tokens`, `auth.mfa_factors`, `auth.mfa_challenges`.
- Localiza os três usuários por email fornecido em GUCs
  (`app.e2e_owner_email`, `app.e2e_team_email`, `app.e2e_tech_email`),
  valida distinção e recusa domínios de produção.
- Namespace fixo `e2e0000*-0000-4000-8000-*` para todos os UUIDs
  funcionais (órgão, painéis, colunas, itens, versões, cards).
- Nomes com prefixo literal `[E2E]`.

### Cleanup
`scripts/e2e/cleanup-work-area.sql` — mesma guarda de ambiente,
transacional, sem `TRUNCATE`, sem `CASCADE`, remove exclusivamente pelos
UUIDs fixos do namespace, aborta se qualquer card sintético apontar para
item fora do namespace.

### Autenticação
- `scripts/e2e/mint-sessions.ts` faz login real pela UI, resolve MFA via
  TOTP RFC 6238 (SHA-1 / 30s / 6 dígitos) usando o segredo do
  `.env.e2e.local`, e salva `storageState` em `.playwright/.auth/`.
- Não imprime tokens, cookies, senhas nem segredos TOTP.
- Falha explícita com `E2E_AUTH_BOOTSTRAP_REQUIRED` quando qualquer
  perfil não existe ou não tem MFA matriculado.
- Nenhum modo especial de autenticação no backend. Nenhum header secreto.

### Variáveis e segredos
- `.env.e2e.example` com apenas nomes.
- `.env.e2e.local` git-ignored (regra `*.local` já existente).
- `.playwright/.auth/`, `playwright-report/`, `test-results/`
  ignorados via `.gitignore` local por diretório.
- `scripts/e2e/validate-environment.ts` verifica presença, distinção de
  e-mails, marcador E2E, URL local/homologada, banco não-produtivo,
  ausência de service role e `.gitignore` cobrindo os artefatos.

### Specs preparados (a executar em 3.C.3.c.1.b)
- `e2e/auth.setup.ts`
- `e2e/owner-panels.spec.ts` — carregamento, criação, nome vazio,
  duplicidade, renomeação, arquivamento com cards (bloqueado),
  persistência após reload.
- `e2e/panel-limit.spec.ts` — atinge 8 Painéis, valida botão desabilitado
  com título de limite, persiste após reload, arquiva no `afterAll`.
- `e2e/fixtures.ts` expõe fixture `axe` para auditoria por página.

### Comandos executados agora
- `bun run test` — Vitest verde (128 casos, mesmo escopo do 3.C.3.b.1).
- `bun run test:coverage` — cobertura V8 gerada.
- `bunx tsgo --noEmit` — typecheck verde.
- `bun run build` — build verde.
- `bun run test:e2e` — **falha controlada esperada**
  (`E2E_AUTH_BOOTSTRAP_REQUIRED`) enquanto storage states não existem.

### Bloqueio conhecido
Bootstrap manual dos três usuários Auth + matrícula MFA é pré-requisito
inevitável do 3.C.3.c.1.b. O ambiente Lovable Cloud não expõe service
role para automação, e este scaffold **não** cria bypass. Consulte
`docs/testing/work-area-e2e-bootstrap.md`.

### Pendências
- **3.C.3.c.1.b** — bootstrap manual, geração dos storage states e
  execução real do owner + confirmação de dois storage states readonly.
- **3.C.3.c.2** — DnD real, readonly, aria-live, foco e falhas de rede.
- **3.C.3.c.3** — Axe completo, cinco resoluções, screenshots, zoom 200%.
- **3.C.3.d** — SQL/pgTAP e concorrência real.
