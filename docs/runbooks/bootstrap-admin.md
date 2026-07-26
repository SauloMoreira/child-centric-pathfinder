# Runbook — Bootstrap do primeiro Administrador Institucional

**Sistema:** Reintegra Infância (DPE-RS)
**Escopo:** procedimento controlado para promover o primeiro usuário ao papel
`admin_institucional` no ambiente de homologação, com auditoria e bloqueio pós-uso.

> **Não** criar usuários diretamente em `auth.users` via migration.
> **Não** gravar e-mail ou senha real em migration.
> **Nunca** deixar este procedimento acessível após o bootstrap.

---

## Pré-requisitos

- Lovable Cloud provisionado e saudável (`supabase--cloud_status`).
- Migrations `0001` a `0009` aplicadas.
- E-mail institucional definido pela DPE-RS para o(a) primeiro(a) administrador(a).
- Registro formal (memorando, ticket institucional) autorizando a promoção.

---

## Passo 1 — Criar a conta pelo gerenciamento de usuários

1. Acessar a área **Cloud → Users** do projeto.
2. Criar o usuário com e-mail institucional. Marcar **email confirmed = true**
   apenas neste ato inicial, pela impossibilidade de completar a confirmação
   por e-mail antes do bootstrap.
3. Enviar credencial temporária pelo canal institucional oficial.

## Passo 2 — Completar o profile

Autenticar com a conta recém-criada uma única vez e alterar a senha em
**Minha conta**. Preencher, imediatamente, o formulário de solicitação de
acesso em **Solicitar acesso** com dados funcionais reais do(a)
administrador(a) (matrícula, cargo, órgão de execução da administração
central), aceitando o termo institucional.

Nota: a solicitação ficará **pendente** no banco. Ela será usada apenas como
registro de trilha; o vínculo e o papel serão gravados a seguir por operação
controlada.

## Passo 3 — Promover ao papel `admin_institucional`

Execute o SQL abaixo **uma única vez**, substituindo o e-mail. Este SQL deve
ser executado por operador autorizado, com registro do responsável, data e
hora em ata institucional. Ele grava auditoria e cria o papel.

```sql
DO $bootstrap$
DECLARE
  v_email  text := 'ADMIN_INSTITUCIONAL@dpe.rs.def.br'; -- SUBSTITUIR
  v_user   uuid;
  v_orgao  uuid;
  v_req    uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = v_email;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado. Crie-o pelo Cloud → Users antes.', v_email;
  END IF;

  -- Impedir bootstrap duplo: se já existe admin, aborta.
  IF EXISTS (SELECT 1 FROM private.user_roles
              WHERE role = 'admin_institucional' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Já existe Administrador Institucional. Bootstrap encerrado.';
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by)
  VALUES (v_user, 'admin_institucional', v_user);

  -- Ativa o profile
  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = v_user;

  -- Vincula ao primeiro órgão ativo, se houver; caso contrário, cria um provisório
  SELECT id INTO v_orgao FROM public.orgaos_execucao
   WHERE ativo = true ORDER BY created_at LIMIT 1;

  IF v_orgao IS NULL THEN
    INSERT INTO public.orgaos_execucao (nome, sigla, comarca, cidade, uf, ativo, criado_por)
    VALUES (
      'Administração Central da DPE-RS',
      'DPE-RS/AC',
      'Porto Alegre',
      'Porto Alegre',
      'RS',
      true,
      v_user
    )
    RETURNING id INTO v_orgao;
  END IF;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by)
  VALUES (v_user, v_orgao, v_user);

  -- Encerra qualquer solicitação aberta desse usuário como aprovada pelo bootstrap
  UPDATE private.access_requests
     SET status = 'aprovada',
         decidido_por = v_user,
         decidido_em = now(),
         orgao_final_id = v_orgao,
         version = version + 1,
         updated_at = now()
   WHERE user_id = v_user AND status IN ('pendente','em_analise');

  -- Auditoria
  INSERT INTO private.audit_events (
    actor_user_id, actor_role, action, entity, entity_id, result, metadata
  ) VALUES (
    v_user, 'admin_institucional',
    'bootstrap.admin_promotion', 'user_role', v_user::text,
    'sucesso',
    jsonb_build_object('orgao_id', v_orgao, 'runbook', 'docs/runbooks/bootstrap-admin.md')
  );
END
$bootstrap$;
```

## Passo 4 — Ativar MFA imediatamente

Autenticar com o(a) administrador(a) recém-promovido(a) e, em **Minha conta →
Autenticação em dois fatores**, configurar o TOTP. Sem MFA (AAL2) a conta não
consegue aprovar nem rejeitar solicitações.

## Passo 5 — Encerramento do bootstrap

- Registrar em ata: data, hora, responsável, IP/estação, versão do sistema.
- Confirmar em auditoria (`private.audit_events`) o evento
  `bootstrap.admin_promotion`.
- Este runbook deverá ser marcado como **executado** no repositório
  (arquivar em `docs/runbooks/executados/`) e removido do índice ativo até
  que uma nova rotação institucional seja justificada.
- Qualquer nova promoção ao papel `admin_institucional` a partir deste ponto
  deve ocorrer **apenas** via RPC administrativa a ser desenvolvida em fase
  posterior (fora do escopo da Fase 1).

## Recuperação de emergência

Se o único administrador perder acesso:
1. Redefinir a senha da conta pelo Cloud → Users.
2. Se o TOTP for perdido, remover fatores MFA existentes pelo Cloud → Users e
   reconfigurar. Registrar o incidente em auditoria manual e em ata.
