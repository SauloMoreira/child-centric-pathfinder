# Bootstrap E2E — Área de Trabalho

Sub-gate 4.1.b · Turno 3.C.3.c.1.a

Este procedimento é executado **uma única vez** por uma pessoa autorizada
para deixar o ambiente E2E pronto. Depois disso, execuções da suíte
Playwright são reproduzíveis por script.

**Nunca compartilhe senhas, segredos TOTP ou tokens pelo chat. Cadastre
os valores diretamente em `.env.e2e.local` e no cofre de secrets do CI.**

## 1. Contas sintéticas

Crie **três** contas dedicadas no Supabase Auth do ambiente E2E, com
e-mails claramente marcados como teste (ex.: `e2e-owner@teste.seudominio`).
Confirme os e-mails.

| Perfil            | Papel exigido         |
| ----------------- | --------------------- |
| owner             | `defensor_publico`    |
| team-readonly     | `membro_equipe`       |
| technical-readonly| `admin_tecnico`       |

Os papéis são atribuídos automaticamente pelo seed em
`scripts/e2e/seed-work-area.sql`. Não é necessário promover manualmente.

## 2. Matrícula MFA

Para cada uma das três contas:

1. Faça login pela UI regular em `/auth`.
2. Complete o fluxo de matrícula MFA (aplicativo autenticador).
3. **Guarde o segredo TOTP em cofre institucional**. É a string base32
   mostrada em texto junto ao QR code, não o código de 6 dígitos.

## 3. Variáveis do ambiente

Copie `.env.e2e.example` para `.env.e2e.local` e preencha:

- `E2E_BASE_URL` — URL local (`http://localhost:8080`) ou homologação.
- `E2E_DATABASE_URL` — DSN Postgres do ambiente E2E (não produção).
- `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD` / `E2E_OWNER_TOTP_SECRET`
- `E2E_TEAM_EMAIL`  / `E2E_TEAM_PASSWORD`  / `E2E_TEAM_TOTP_SECRET`
- `E2E_TECH_EMAIL`  / `E2E_TECH_PASSWORD`  / `E2E_TECH_TOTP_SECRET`

`.env.e2e.local` está no `.gitignore` e nunca deve ser comitado.
No CI, cadastre os mesmos nomes como secrets do runner.

## 4. Preparação

Ordem obrigatória, a partir da raiz do projeto:

```bash
bun run test:e2e:install     # baixa Chromium
bun run e2e:mint-sessions    # gera .playwright/.auth/*.json
bun run e2e:prepare          # valida env + aplica cleanup + seed
bun run test:e2e             # roda a suíte
```

O script `mint-sessions` faz login real pela UI e conclui MFA usando
o segredo TOTP local. Se qualquer perfil ainda não estiver matriculado,
ele aborta com `E2E_AUTH_BOOTSTRAP_REQUIRED`.

O script `prepare-environment` aplica o SQL com a GUC obrigatória
`app.environment=e2e` fornecida externamente via `PGOPTIONS`. O seed
**recusa executar** sem essa GUC.

## 5. Limpeza

- Storage states ficam em `.playwright/.auth/` (git-ignored). Renove-os
  rodando `bun run e2e:mint-sessions` sempre que os tokens vencerem.
- Para reiniciar dados: `bun run e2e:prepare` (roda cleanup antes de
  reaplicar o seed).
- Nenhum script remove usuários do Auth.

## 6. O que NÃO fazer

- Enviar senhas, tokens ou segredos TOTP pelo chat.
- Adicionar valores reais ao `.env.e2e.example`.
- Comitar `.env.e2e.local`, `.playwright/.auth/`, `playwright-report/`
  ou `test-results/`.
- Colocar o seed em `supabase/migrations/`.
- Criar bypass de MFA, header secreto ou modo especial no backend.
- Usar service role em qualquer script E2E.
