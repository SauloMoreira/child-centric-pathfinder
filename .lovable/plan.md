# Fase 2 — Gestão de Equipe e Vínculos Institucionais

## Diagnóstico da Fase 1 (preservado)

Migrations existentes vão até `20260726164601` (14 arquivos). Estruturas relevantes:

- `public.profiles` — perfis (status: `aguardando_dados|aguardando_aprovacao|ativo|suspenso|inativo`)
- `public.orgaos_execucao` — órgãos (nome, comarca, normalizados)
- `private.user_roles` — papéis (`admin_tecnico|admin_institucional|defensor_publico|membro_equipe`)
- `private.user_org_memberships` — vínculos, com índice único parcial 1 ativo/usuário ✅
- `private.audit_events` — auditoria append-only
- `private.access_requests` — solicitações
- Funções: `tem_papel`, `private.is_admin_tecnico`, `current_user_is_admin`, `current_user_has_aal2`, RPCs de aprovação e criação de órgão

Rotas: `_authenticated/{painel,conta,solicitar-acesso,admin/*,admin-tecnico/*}`. **Não existe** `/minha-equipe` nem `/alterar-orgao`.

**Reuso:** `user_org_memberships`, `user_roles`, `audit_events`, `profiles`, funções de autorização. **Sem MFA** em operações ordinárias de Defensor.

## Escopo

### Backend (7 migrations novas, continuando de 0015+)

1. **Enum + tabela de convites** — `team_invitation_status`, colunas `funcao_interna`, `outra_funcao` em `profiles`; `private.team_invitations` com idempotência, expiração, sem token/senha
2. **Funções de segurança** — `private.current_active_org_id()`, `is_defensor_publico()`, `is_membro_equipe()`, `user_can_manage_team_member(uuid)`, `user_can_access_org(uuid)`
3. **RPCs de equipe:**
   - `submit_team_invitation` — chamada pela edge function após validar duplicidade
   - `complete_team_member_onboarding(p_invitation_id)` — ativação em transação
   - `resend_team_invitation(p_id)` — rate-limited
   - `cancel_team_invitation(p_id, p_motivo)`
   - `block_team_member(p_user_id, p_motivo)`, `reactivate_team_member`, `end_team_membership`
   - `update_team_member(p_user_id, dados)`
4. **RPC alteração órgão Defensor** — `defensor_change_active_org(p_new_orgao_id, p_expected_membership_id, p_idempotency_key)` sem exigência de AAL2
5. **RLS** — políticas para Defensor ver equipe do próprio órgão, Admin Técnico global, membro só a si mesmo; GRANTs
6. **Índices/constraints** — únicos parciais em convites pendentes (orgão+email)
7. **Auditoria** — expandir catálogo de eventos

### Edge Function

- `supabase/functions/invite-team-member/` — valida JWT, determina órgão pelo backend (nunca do frontend p/ Defensor), verifica duplicidade, chama `supabase.auth.admin.inviteUserByEmail`, grava convite. Secrets: `SUPABASE_SERVICE_ROLE_KEY` (já existe).

### Frontend

**Rotas novas:**
- `/_authenticated/minha-equipe` — Kanban Command Center (4 colunas)
- `/_authenticated/alterar-orgao` — fluxo de mudança de órgão do Defensor
- `/ativar-convite` (público) — captura sessão pós-magic-link, chama `complete_team_member_onboarding`

**Componentes:**
- `team-kanban-board.tsx`, `team-member-card.tsx`, `team-member-drawer.tsx`
- `add-team-member-sheet.tsx` (form Zod, sem campo de órgão)
- `team-list-view.tsx` (alternativa Kanban↔lista)
- `change-org-flow.tsx` com card de impacto
- Hooks: `use-team-members`, `use-team-invitations`, `use-invite-team-member`, `use-change-org`

**Navegação:** adicionar "Minha equipe" na sidebar para Defensor/Admin Técnico; "Alterar órgão" no menu da conta para Defensor.

### Segurança

- Zod compartilhado cliente+servidor
- Rate limit em `resend_team_invitation` (min. 60s entre reenvios, max 5/dia)
- Mapeamento de códigos de erro em `src/lib/team-errors.ts`
- Sem `service_role` no bundle; toda mutação privilegiada via edge function ou RPC SECURITY DEFINER
- Alteração de órgão do Defensor: **sem MFA** (operação ordinária)
- Admin Técnico criando membro em qualquer órgão: exige justificativa + auditoria (sem MFA para não bloquear operação)

## Fora do escopo

- Convite em massa (Fase 3)
- Transferência automática entre órgãos
- Notificações in-app (só e-mail via Supabase Auth invite)
- Testes E2E automatizados completos (deixarei script manual documentado; testes de banco via queries de verificação)

## Detalhes técnicos

- Numeração de migrations: continua timestamp real, mas rotuladas 0015→0021 no comentário
- Regeneração de tipos Supabase automática após migrations
- Edge function usa `verify_jwt = true` (default) — extrai user do JWT do solicitante
- E-mail do convite usa template padrão Supabase Auth (`inviteUserByEmail`), com `redirectTo` apontando para `/ativar-convite`
- `funcao_interna` adicionado em `profiles` (não em memberships) pois é atributo funcional do usuário
- Índice único parcial em convites: `(orgao_id, email_normalizado) WHERE status IN ('preparando','enviado')`

## Entrega

Após aplicar as migrations e a edge function, farei uma passada de verificação (tsgo, listar policies) e apresentarei um relatório curto com: arquivos criados, RPCs, matriz de permissões, e o passo manual necessário (configurar template de e-mail de convite no painel Auth, se desejado personalizar).
