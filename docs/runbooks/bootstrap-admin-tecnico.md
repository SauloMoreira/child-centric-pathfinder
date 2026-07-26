# Runbook — Bootstrap do primeiro Administrador Técnico

**Sistema:** Reintegra Infância (DPE-RS)
**Escopo:** procedimento controlado para promover o primeiro usuário ao papel
`admin_tecnico` — a autoridade técnica máxima do Reintegra Infância. Deve ser
executado uma única vez, com registro em ata institucional e bloqueio
posterior da rotina.

> **Não** criar o usuário master diretamente em `auth.users` via migration.
> **Não** armazenar senha, e-mail ou credencial em migration.
> **Nunca** deixar este procedimento acessível após o bootstrap.

---

## Pré-requisitos

- Lovable Cloud provisionado e saudável (`supabase--cloud_status`).
- Migrations `0001` a `0011` aplicadas (a `0011` cria as funções `private.is_admin_tecnico`, `private.is_global_admin` e a RPC `public.promover_admin_tecnico`).
- E-mail institucional nominal previamente autorizado pela DPE-RS
  (placeholder no restante do documento: `<EMAIL_DO_ADMIN_TECNICO>`).
- Registro formal (memorando, ticket institucional) autorizando a promoção.

---

## Passo 1 — Criar a conta nominal pelo gerenciamento de usuários

1. Acessar **Cloud → Users** do projeto.
2. Criar o usuário com o e-mail institucional `<EMAIL_DO_ADMIN_TECNICO>`.
   Marcar **email confirmed = true** apenas neste ato inicial.
3. Enviar credencial temporária pelo canal institucional oficial.
4. A conta deve ser individual e nominal — **não** utilizar caixa
   compartilhada.

## Passo 2 — Autenticar, trocar a senha e habilitar MFA

Autenticar com a conta recém-criada uma única vez, trocar a senha em
**Minha conta** e, imediatamente, configurar o TOTP em **Autenticação em
dois fatores**. Sem MFA (AAL2) a conta não conseguirá executar as ações
técnicas críticas exigidas pela função.

## Passo 3 — Promoção controlada ao papel `admin_tecnico`

Execute o SQL abaixo **uma única vez** pelo operador autorizado (com
registro do responsável, data e hora em ata institucional). Este SQL grava
auditoria, bloqueia bootstrap duplo e ativa o profile.

```sql
DO $bootstrap_tec$
DECLARE
  v_email text := '<EMAIL_DO_ADMIN_TECNICO>';  -- SUBSTITUIR
  v_user  uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = v_email;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado. Crie-o pelo Cloud → Users antes.', v_email;
  END IF;

  -- Bootstrap único: se já existe admin_tecnico, aborta.
  IF EXISTS (
    SELECT 1 FROM private.user_roles
     WHERE role = 'admin_tecnico' AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Já existe Administrador Técnico. Bootstrap encerrado.';
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by)
  VALUES (v_user, 'admin_tecnico', v_user);

  -- Ativa o profile. O Administrador Técnico NÃO é vinculado obrigatoriamente
  -- a um órgão de execução; o acesso é global via RLS.
  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = v_user;

  INSERT INTO private.audit_events (
    actor_user_id, actor_role, action, entity, entity_id, result, metadata
  ) VALUES (
    v_user, 'admin_tecnico',
    'bootstrap.admin_tecnico_promotion', 'user_role', v_user::text,
    'sucesso',
    jsonb_build_object('runbook','docs/runbooks/bootstrap-admin-tecnico.md')
  );
END
$bootstrap_tec$;
```

## Passo 4 — Verificação

Autenticar com o Administrador Técnico e confirmar que a barra superior
exibe o badge `ADMIN TÉCNICO`, o menu lateral apresenta a seção
**Administração Técnica** e a faixa persistente
`Acesso técnico global ativo — todas as ações estão sendo auditadas.`
aparece em `/admin-tecnico/*`.

## Passo 5 — Encerramento do bootstrap

- Registrar em ata: data, hora, responsável, IP/estação, versão do sistema.
- Confirmar o evento `bootstrap.admin_tecnico_promotion` em
  `private.audit_events`.
- Arquivar este runbook em `docs/runbooks/executados/` e removê-lo do
  índice ativo até nova rotação institucional justificada.

## Promoções subsequentes

A partir deste ponto, novas promoções ao papel `admin_tecnico` ocorrem
**exclusivamente** pela RPC administrativa
`public.promover_admin_tecnico(uuid, text)` — chamada pela tela
**Administração Técnica → Administradores** por outro `admin_tecnico`
com sessão em AAL2. A operação exige justificativa mínima de 20 caracteres,
auto-promoção é bloqueada e cada execução gera evento auditável
`tecnico.promote_admin_tecnico`.

## Recuperação de emergência

Se o único Administrador Técnico perder acesso:
1. Redefinir a senha da conta pelo Cloud → Users.
2. Se o TOTP for perdido, remover fatores MFA existentes pelo Cloud →
   Users e reconfigurar. Registrar o incidente em auditoria manual e em
   ata institucional.
