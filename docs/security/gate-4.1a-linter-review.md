# Sub-gate 4.1.a — Baseline, Linter e Superfície de Segurança

**Status final:** ✅ APROVADO
**Data:** 2026-07-27
**Escopo:** Orienta DPE — schemas `public` e `private` no backend Supabase.

## Resumo executivo

| Métrica | Antes | Depois |
| --- | --- | --- |
| Alertas totais do linter | 108 | 85 |
| Funções `SECURITY DEFINER` chamáveis por `anon` | 41 | **0** |
| Funções `SECURITY DEFINER` chamáveis por `PUBLIC` | 41 | **0** |
| Helpers do schema `private` chamáveis pelo cliente | 27 | **0** |
| Funções `SECURITY DEFINER` sem `search_path` seguro | 0 | 0 |
| Typecheck (`tsgo`) | ✅ | ✅ |

## 1. Inventário de funções `SECURITY DEFINER`

Total de **106** funções `SECURITY DEFINER` (77 em `public`, 29 em `private`).
Todas verificadas com `search_path = ''` ou `search_path = public` explícito
(nenhuma delega ao `search_path` do chamador).

**Public (77):** RPCs institucionais da biblioteca, kanban, equipe, órgãos,
solicitações e administração técnica. Cada uma valida sessão via
`auth.uid()` + papel via `private.current_user_role()` /
`private.has_role()`. Todas passaram a exigir role `authenticated`.

**Private (29):** helpers de autorização e auditoria — `assert_can_*`,
`current_user_*`, `is_*`, `user_can_*`, `log_audit_event`,
`require_aal2_if_enrolled`, `claim_idempotency`, `complete_idempotency`,
`resolve_*`. Nenhum é chamável diretamente pelo cliente (permissão revogada
de `PUBLIC`, `anon` e `authenticated`); executam como owner dentro de outras
funções `SECURITY DEFINER` ou de triggers em tabelas do schema `public`.

## 2. Correções aplicadas (migration `0032_gate_4_1_a_least_privilege`)

1. `REVOKE ALL ... FROM PUBLIC, anon, authenticated` em **todas** as 106
   funções `SECURITY DEFINER` de `public` e `private`.
2. `GRANT EXECUTE ... TO authenticated` restaurado apenas para as 77 RPCs
   do schema `public`.
3. `ALTER DEFAULT PRIVILEGES` nos dois schemas para impedir que futuras
   funções herdem `EXECUTE` para `PUBLIC`/`anon` (e também para
   `authenticated` no schema `private`).

**Verificação por privilégio (`pg_proc` + `has_function_privilege`):**

```
public   SECDEF total=77  anon_can=0  authenticated_can=77
private  SECDEF total=29  anon_can=0  authenticated_can=0
```

## 3. Classificação dos alertas restantes (85)

### 3.1 `0008_rls_enabled_no_policy` — 7 INFO — **FALSO POSITIVO COMPROVADO**

Tabelas: `private.access_requests`, `private.audit_events`,
`private.team_invitations`, `private.user_org_memberships`,
`private.user_roles`, `private.user_workspace_columns`,
`private.user_workspaces`.

Todas residem no schema `private`, que **não é exposto** ao PostgREST
(nem `anon` nem `authenticated` possuem `USAGE` no schema). RLS habilitado
sem política funciona como *deny-all* — reforço defensivo. O acesso legítimo
ocorre exclusivamente por funções `SECURITY DEFINER` executando como owner
do schema (bypass documentado do RLS). Nenhuma ação necessária.

### 3.2 `0014_extension_in_public` (`pg_trgm`) — 1 WARN — **RISCO BAIXO ACEITO E DOCUMENTADO**

Extensão instalada em `public` desde a Fase 1. Move-la exige recriar índices
e RPCs de busca que dependem dos operadores `%`/`similarity`. Conforme
deliberação da seção 9 do prompt de governança, a movimentação será testada
em ambiente descartável antes de qualquer aplicação em produção; o risco
atual é limitado a *namespace pollution* (a extensão não introduz funções
sensíveis a autenticação). Reavaliar durante Sub-gate 4.1.f.

### 3.3 `0029_authenticated_security_definer_function_executable` — 77 WARN — **RISCO BAIXO ACEITO E DOCUMENTADO**

Detecta `SECURITY DEFINER` chamáveis por `authenticated`. Por construção,
toda RPC pública do Orienta DPE precisa ser invocável por usuários
autenticados (sem isso o cliente não funciona). Cada uma dessas funções:

- valida `auth.uid()` no primeiro `IF`;
- resolve o papel via `private.*` (nunca aceita papel/e-mail vindo do
  cliente);
- verifica `profile.status = 'ativo'` antes de operações sensíveis;
- aplica `require_aal2_if_enrolled` nas rotinas administrativas críticas
  (`admin_assign_defensor_role`, `admin_create_orgao_execucao`,
  `admin_add_comarca_to_orgao`, etc.);
- registra tentativas negadas em `private.audit_events` via
  `private.log_audit_event`.

O alerta é informacional — a Supabase o emite para todo `SECURITY DEFINER`
público, sem inferir a autorização interna. Manter.

## 4. Views

Inventário: **nenhuma view remanescente** nos schemas `public` e `private`
(a view legada `v_assistidos_card` foi removida no Gate 4). Sem ação
adicional necessária.

## 5. Grants em tabelas

Todas as tabelas de `public` possuem RLS habilitado e políticas escritas
para `authenticated` restringindo por `auth.uid()` ou por helper de papel.
As tabelas de `private` **não** possuem grant para `anon`/`authenticated`
(acesso apenas via SECURITY DEFINER). Confirmado por
`information_schema.role_table_grants`.

## 6. Testes negativos executados

| Cenário | Resultado |
| --- | --- |
| `has_function_privilege('anon', <RPC pública>, 'EXECUTE')` — todas as 77 RPCs | `false` |
| `has_function_privilege('anon', <helper private>, 'EXECUTE')` — todas as 29 | `false` |
| `has_function_privilege('authenticated', <helper private>, 'EXECUTE')` — todas as 29 | `false` |
| `has_function_privilege('authenticated', <RPC pública>, 'EXECUTE')` — todas as 77 | `true` |
| `has_schema_privilege('anon','private','USAGE')` | `false` |
| `has_schema_privilege('authenticated','private','USAGE')` | `false` |

Testes de integração ponta-a-ponta (payloads maliciosos, tentativa de
edição cruzada entre defensores, membro tentando criar conteúdo, papel
enviado pelo frontend) permanecem como pré-requisito do Sub-gate 4.1.b
(que introduz a suíte de testes SQL e Playwright).

## 7. Pendências não bloqueantes carregadas para sub-gates seguintes

- **4.1.b**: suíte automatizada de testes negativos (SQL + Playwright),
  imutabilidade forte de `content_versions`, hash de payload.
- **4.1.f**: reavaliar `pg_trgm` em schema dedicado (`extensions`), CI
  versionada com typecheck/lint/testes/drift de migrations.

## Decisão

**SUB-GATE 4.1.a APROVADO.**

Superfície de execução do banco reduzida ao mínimo necessário; alertas
remanescentes classificados individualmente como falso positivo comprovado
ou risco baixo aceito e documentado. Nenhum alerta crítico ou alto
permanece. Autorizado prosseguir para o Sub-gate 4.1.b.
