
# Plano — Área de trabalho (Kanban Intelligence Workspace)

Entrega em ciclo único, mas organizada em 5 blocos sequenciais dentro deste ciclo. Cada bloco depende do anterior.

## Bloco 1 — Modelo de dados de assistidos (crianças e adolescentes)

Migration `0015_assistidos_schema.sql` criando:

**Tabelas em `public`:**
- `assistidos` — id, nome_completo, nome_social, data_nascimento, sexo_registral, genero, foto_url, situacao_atual (enum), orgao_execucao_id (FK), created_at/by, updated_at/by, deleted_at (soft delete), search_document (tsvector).
- `assistido_acolhimentos` — id, assistido_id, entidade_nome, tipo (institucional/familiar), data_ingresso, data_saida, data_reavaliacao, motivo_encerramento, ativo (bool).
- `assistido_processos` — id, assistido_id, numero_processo, tipo, situacao (enum), prioridade, prazo_proximo (date).
- `assistido_familiares` — id, assistido_id, nome, parentesco (enum), assistido_pela_dpe (bool), responsavel (bool).
- `assistido_providencias` — id, assistido_id, descricao, responsavel_user_id, prazo, concluida_em.
- `assistido_updates_log` — timestamps derivados para "sem atualização há X dias".

**Enums:** `situacao_atual_enum`, `tipo_acolhimento_enum`, `situacao_processo_enum`, `parentesco_enum`, `prioridade_enum`.

**Índices:** GIN em `search_document`, btree em `orgao_execucao_id`, `situacao_atual`, `data_nascimento`; parciais para `acolhimento_ativo` e `prazo_vencido`.

**View materializada leve** `public.v_assistidos_card` — projeção pronta para o Kanban (idade calculada, tempo_acolhimento_dias, acolhimento_ativo, processos_ativos, prazo_mais_proximo, ultima_atualizacao). Refresh via trigger nos filhos.

**RLS:** SELECT restrito a `orgao_execucao_id = private.current_active_org_id()` OU `private.is_admin_tecnico()`. Sem INSERT/UPDATE via API nesta fase (dados fictícios criados por seed).

**Seed:** 40 assistidos fictícios distribuídos em 2 órgãos, com acolhimentos, processos, familiares e providências variadas para exercitar todos os filtros.

## Bloco 2 — Modelo de workspaces personalizáveis

Migration `0016_workspaces.sql`:

- `private.user_workspaces` — id, user_id, orgao_execucao_id (null=global), context_type ('orgao'|'todos_orgaos'), nome, timestamps. UNIQUE(user_id, orgao_execucao_id, context_type).
- `private.user_workspace_columns` — id, workspace_id, title, description, color_token (enum), custom_color (nullable, validado #rrggbb), filter_definition jsonb, position int, is_base_column bool, version, timestamps. UNIQUE(workspace_id, position) DEFERRABLE.
- Constraint: apenas 1 `is_base_column=true` por workspace (unique index parcial).

**RLS:** tudo restrito a `user_id = auth.uid()`. Admin técnico não edita workspaces alheios.

**Grants + audit hooks.**

## Bloco 3 — Motor de filtros seguro (allowlist)

Migration `0017_workspace_rpcs.sql`:

**Função `private.validate_filter_definition(jsonb)`** — valida schema, allowlist de campos, allowlist de operadores por campo, tipos de valor.

**Allowlist de campos (documentada no código):**
`nome_texto, faixa_etaria, idade_min, idade_max, sexo, genero, tem_foto, situacao_atual, acolhimento_ativo, tipo_acolhimento, entidade_acolhimento, tempo_acolhimento_dias, reavaliacao_status, tem_processo_ativo, tipo_processo, situacao_processo, tem_demanda_extrajudicial, prioridade_demanda, familiar_dpe, tem_providencia_pendente, prazo_status, responsavel_user_id, tem_vinculos_familiares, tem_irmaos, ultima_atualizacao_bucket, orgao_execucao_id, comarca`.

**Operadores permitidos por campo** (validação por tipo).

**RPCs (todas SECURITY DEFINER, search_path=''):**
- `ensure_default_workspace(p_context text, p_orgao_id uuid)` → retorna workspace_id, cria coluna base se ausente. Idempotente.
- `listar_workspace(p_context, p_orgao_id)` → workspace + colunas ordenadas.
- `create_workspace_column(p_workspace_id, p_title, p_description, p_color_token, p_custom_color, p_filter jsonb)`.
- `update_workspace_column(p_column_id, p_version, ...campos...)`.
- `delete_workspace_column(p_column_id)` — bloqueia base.
- `duplicate_workspace_column(p_column_id)`.
- `reorder_workspace_columns(p_workspace_id, p_ordered_ids uuid[])`.
- `reset_workspace_to_default(p_workspace_id)`.
- `buscar_assistidos(p_text, p_filter jsonb, p_orgao_id, p_limit, p_cursor)` — busca global superior.
- `get_workspace_column_assistidos(p_column_id, p_cursor, p_limit, p_search)` — dados do Kanban. Limite máx 100.

Todas registram em `private.audit_events` (workspace.*).

## Bloco 4 — Frontend

**Rotas:**
- `src/routes/_authenticated/area-de-trabalho.tsx` (novo).
- `src/routes/_authenticated/painel.tsx` → redirect 301 client-side para `/area-de-trabalho`.
- Sidebar renomeada: "Painel" → "Área de trabalho".

**Componentes novos em `src/components/workspace/`:**
`WorkspacePage`, `WorkspaceSearch`, `WorkspaceSearchInput`, `WorkspaceFilterBuilder`, `WorkspaceActiveFilters`, `WorkspaceSearchResults`, `WorkspaceToolbar`, `WorkspaceBoard`, `WorkspaceColumn`, `WorkspaceColumnHeader`, `WorkspaceColumnMenu`, `WorkspaceColumnForm` (Sheet), `WorkspaceColumnColorPicker`, `WorkspaceColumnFilterSummary`, `WorkspaceColumnEmptyState`, `WorkspaceCard`, `WorkspaceCardSkeleton`, `WorkspaceCardDrawer`, `WorkspaceMobileColumnSelector`, `WorkspaceReorderDialog`, `WorkspaceResetDialog`.

**Reordenação de colunas:** botões "Mover ←/→" + drag opcional com `@dnd-kit/core` (só entre colunas, não entre cards). Sem drag em mobile.

**Hooks:**
- `useWorkspace(context, orgaoId)` — ensure + listar.
- `useColumnAssistidos(columnId)` — infinite query, cursor.
- `useBuscaAssistidos()` — debounced (350ms), cancelamento.
- `useWorkspaceMutations()` — create/update/delete/reorder/duplicate/reset.

**Design tokens de cor de coluna** em `src/styles.css` (`--workspace-col-neutral/green/blue/amber/burgundy/purple/slate/rose`) com variantes claro/escuro.

**Estados:** loading (skeleton), erro, vazio (3 variantes), quadro em criação.

**Responsividade:** desktop scroll horizontal; mobile seletor de coluna + navegação horizontal; filtros em Sheet.

## Bloco 5 — Testes e verificação

**Setup Vitest** (`vitest`, `@testing-library/react`, `jsdom`) + `bun test` script.

**Testes de unidade:**
- `validate_filter_definition` — cobre allowlist de campos, operador incompatível, payload malformado, tentativa de SQL, limite.
- Redução de filtro para SQL parametrizado — snapshots com valores canônicos.
- Utilitário `normalize-search-text` (client mirror).

**Testes de componente:** `WorkspaceColumnForm` (validação), `WorkspaceFilterBuilder` (chips AND/OR), `WorkspaceCard` (ícones e tooltips).

**Checks finais:** `bun run build`, `tsgo`, `vitest run`, `supabase--linter`, regeneração dos tipos.

## Detalhes técnicos

**Estrutura do JSON de filtros** — versionado (`version: 1`), objeto raiz com `text` (string|null) e `conditions` (array de `{field, operator, value}`). Backend rejeita qualquer campo/operador fora da allowlist. Consultas construídas com CTEs parametrizadas por campo, nunca por concatenação de identificadores.

**Cor personalizada** — apenas hex `^#[0-9a-fA-F]{6}$`, contraste WCAG AA calculado no backend contra branco/preto para escolher cor de texto.

**Auditoria** — usa `private.log_audit_event` existente com actions `workspace.*`. Não registra payload de filtros com valores literais; grava apenas o hash de campos usados e resultado.

**Escopo por perfil** — RLS em assistidos + `get_workspace_column_assistidos` valida:
- Defensor/Membro: só `orgao_execucao_id = current_active_org_id()`.
- Admin institucional: escopo definido pela política existente.
- Admin técnico: pode passar `p_orgao_id=null` (todos) ou órgão específico; requer AAL2 se `context_type='todos_orgaos'`; registra auditoria com actor_role.

**Pendências assumidas (não implementadas nesta entrega):**
- CRUD de assistidos (só seed).
- Foto real (usa placeholder).
- Import de dados reais.
- MFA step-up para admin técnico em modo global apenas em ações destrutivas.

## Riscos

- Escopo muito amplo em um ciclo — alto volume de código; possíveis ajustes finos após testes visuais.
- Refresh da view materializada — pode gerar latência em datasets maiores; nesta fase (seed pequeno) é aceitável, mas fica registrado como pendência.
- Filtros textuais dependem de `unaccent` (habilitar extensão na migration).
