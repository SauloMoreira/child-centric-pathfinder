
-- =========================================================================
-- FASE 2 — Gestão de Equipe e Vínculos
-- =========================================================================

-- ------------------------------------------------------------------------
-- 1. Enum de status do convite
-- ------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.team_invitation_status AS ENUM
    ('preparando','enviado','aceito','expirado','cancelado','falhou');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------
-- 2. Colunas funcionais em profiles
-- ------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS funcao_interna text,
  ADD COLUMN IF NOT EXISTS outra_funcao text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_funcao_interna_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_funcao_interna_check
  CHECK (funcao_interna IS NULL OR funcao_interna IN
    ('assessor','servidor','estagiario','residente','colaborador','outro'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_outra_funcao_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_outra_funcao_len
  CHECK (outra_funcao IS NULL OR char_length(outra_funcao) <= 100);

-- Política adicional: membro ativo pode atualizar dados funcionais próprios (telefone/nome/funcao)
DROP POLICY IF EXISTS profiles_update_own_functional ON public.profiles;
CREATE POLICY profiles_update_own_functional ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'ativo'::public.profile_status)
  WITH CHECK (user_id = auth.uid() AND status = 'ativo'::public.profile_status);

-- Ajuste no trigger guard: também bloquear alteração de funcao_interna via UI se preferir? Não — permitido.
-- O trigger já bloqueia status/ativo/user_id via política institucional.

-- ------------------------------------------------------------------------
-- 3. Tabela private.team_invitations
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  email text NOT NULL,
  email_normalizado text NOT NULL,
  nome_completo text NOT NULL,
  matricula text,
  funcao_interna text NOT NULL,
  outra_funcao text,
  telefone text,
  status public.team_invitation_status NOT NULL DEFAULT 'preparando',
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  auth_user_id uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  sent_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  failure_code text,
  resend_count integer NOT NULL DEFAULT 0,
  last_resent_at timestamptz,
  motivo_cancelamento text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_inv_nome_len CHECK (char_length(nome_completo) BETWEEN 5 AND 200),
  CONSTRAINT team_inv_email_len CHECK (char_length(email_normalizado) BETWEEN 3 AND 320),
  CONSTRAINT team_inv_matricula_len CHECK (matricula IS NULL OR char_length(matricula) <= 30),
  CONSTRAINT team_inv_funcao_check CHECK (funcao_interna IN
    ('assessor','servidor','estagiario','residente','colaborador','outro')),
  CONSTRAINT team_inv_outra_len CHECK (outra_funcao IS NULL OR char_length(outra_funcao) <= 100),
  CONSTRAINT team_inv_idempotency_unique UNIQUE (idempotency_key)
);

-- Unicidade: só pode haver um convite pendente/enviado por (orgão, email)
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_inv_pending_per_org_email
  ON private.team_invitations (orgao_execucao_id, email_normalizado)
  WHERE status IN ('preparando','enviado');

CREATE INDEX IF NOT EXISTS ix_team_inv_orgao_status
  ON private.team_invitations (orgao_execucao_id, status);
CREATE INDEX IF NOT EXISTS ix_team_inv_email
  ON private.team_invitations (email_normalizado);
CREATE INDEX IF NOT EXISTS ix_team_inv_auth_user
  ON private.team_invitations (auth_user_id) WHERE auth_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_team_inv_updated_at ON private.team_invitations;
CREATE TRIGGER trg_team_inv_updated_at
  BEFORE UPDATE ON private.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger que expira convite automaticamente ao consultar (marca como expirado se passou do prazo)
CREATE OR REPLACE FUNCTION private.tg_team_inv_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.email_normalizado := lower(btrim(NEW.email));
  NEW.nome_completo := regexp_replace(btrim(NEW.nome_completo), '\s+', ' ', 'g');
  IF NEW.matricula IS NOT NULL THEN
    NEW.matricula := btrim(NEW.matricula);
    IF NEW.matricula = '' THEN NEW.matricula := NULL; END IF;
  END IF;
  IF NEW.outra_funcao IS NOT NULL THEN
    NEW.outra_funcao := btrim(NEW.outra_funcao);
    IF NEW.outra_funcao = '' THEN NEW.outra_funcao := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_inv_normalize ON private.team_invitations;
CREATE TRIGGER trg_team_inv_normalize
  BEFORE INSERT OR UPDATE ON private.team_invitations
  FOR EACH ROW EXECUTE FUNCTION private.tg_team_inv_normalize();

-- Sem RLS pública: schema private não é exposto ao PostgREST.
-- Acesso somente via RPCs SECURITY DEFINER e edge functions.
ALTER TABLE private.team_invitations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------
-- 4. Funções auxiliares de segurança
-- ------------------------------------------------------------------------

-- Verifica se o usuário atual pode gerenciar um determinado membro
CREATE OR REPLACE FUNCTION private.user_can_manage_team_member(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_target_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF private.is_admin_tecnico() THEN RETURN true; END IF;
  IF NOT private.is_defensor_publico() THEN RETURN false; END IF;

  SELECT orgao_id INTO v_org FROM private.user_org_memberships
   WHERE user_id = v_uid AND ativo = true LIMIT 1;
  SELECT orgao_id INTO v_target_org FROM private.user_org_memberships
   WHERE user_id = p_target_user_id AND ativo = true LIMIT 1;

  RETURN v_org IS NOT NULL AND v_org = v_target_org;
END;
$$;

REVOKE ALL ON FUNCTION private.user_can_manage_team_member(uuid) FROM PUBLIC;

-- ------------------------------------------------------------------------
-- 5. RPCs de convite (schema public, callable via PostgREST)
-- ------------------------------------------------------------------------

-- 5.1 Criação de convite (chamada pela edge function OU diretamente por defensor autenticado)
-- A validação de duplicidade de auth.users será feita pela edge function.
CREATE OR REPLACE FUNCTION public.criar_convite_equipe(
  p_nome_completo text,
  p_email text,
  p_matricula text,
  p_funcao_interna text,
  p_outra_funcao text,
  p_telefone text,
  p_orgao_id uuid,           -- só usado por admin_tecnico; para defensor é ignorado
  p_justificativa text,       -- obrigatório para admin_tecnico atuando em outro órgão
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_tec boolean;
  v_is_def boolean;
  v_orgao uuid;
  v_defensor_org uuid;
  v_email_norm text;
  v_existing_id uuid;
  v_new_id uuid;
  v_actor_role public.app_role;
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_is_tec := private.is_admin_tecnico();
  v_is_def := private.is_defensor_publico();

  IF NOT (v_is_tec OR v_is_def) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Perfil precisa estar ativo
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE user_id = v_uid AND status = 'ativo' AND ativo = true) THEN
    RAISE EXCEPTION 'USER_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  -- Determinar órgão de destino
  IF v_is_def THEN
    SELECT orgao_id INTO v_defensor_org FROM private.user_org_memberships
     WHERE user_id = v_uid AND ativo = true LIMIT 1;
    IF v_defensor_org IS NULL THEN
      RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE = '42501';
    END IF;
    v_orgao := v_defensor_org;
    v_actor_role := 'defensor_publico';
  ELSE
    -- Admin técnico
    IF p_orgao_id IS NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    IF p_justificativa IS NULL OR char_length(btrim(p_justificativa)) < 10 THEN
      RAISE EXCEPTION 'Justificativa obrigatória para acesso técnico global.' USING ERRCODE = '22023';
    END IF;
    v_orgao := p_orgao_id;
    v_actor_role := 'admin_tecnico';
  END IF;

  -- Validações de entrada
  IF p_nome_completo IS NULL OR char_length(btrim(p_nome_completo)) < 5 THEN
    RAISE EXCEPTION 'Nome completo é obrigatório (mín. 5 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_funcao_interna NOT IN ('assessor','servidor','estagiario','residente','colaborador','outro') THEN
    RAISE EXCEPTION 'Função interna inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_funcao_interna = 'outro' AND (p_outra_funcao IS NULL OR btrim(p_outra_funcao) = '') THEN
    RAISE EXCEPTION 'Descreva a função quando escolher "outro".' USING ERRCODE = '22023';
  END IF;

  v_email_norm := lower(btrim(p_email));

  -- Defensor não pode convidar a si mesmo
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND lower(email) = v_email_norm) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Verificar órgão existe
  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = v_orgao) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  -- Idempotência
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM private.team_invitations
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'invitation_id', v_existing_id);
    END IF;
  END IF;

  -- Convite pendente já existente no mesmo órgão
  IF EXISTS (SELECT 1 FROM private.team_invitations
             WHERE orgao_execucao_id = v_orgao
               AND email_normalizado = v_email_norm
               AND status IN ('preparando','enviado')) THEN
    RAISE EXCEPTION 'TEAM_INVITATION_ALREADY_PENDING' USING ERRCODE = '23505';
  END IF;

  -- Se o email pertence a usuário já existente, verificar vínculos e papéis
  DECLARE
    v_existing_user uuid;
    v_existing_active_org uuid;
    v_has_incompat boolean;
  BEGIN
    SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email_norm LIMIT 1;
    IF v_existing_user IS NOT NULL THEN
      -- papéis incompatíveis?
      SELECT EXISTS(SELECT 1 FROM private.user_roles
                    WHERE user_id = v_existing_user AND revoked_at IS NULL
                      AND role IN ('admin_tecnico','admin_institucional','defensor_publico'))
      INTO v_has_incompat;
      IF v_has_incompat THEN
        RAISE EXCEPTION 'USER_HAS_INCOMPATIBLE_ROLE' USING ERRCODE = '42501';
      END IF;

      SELECT orgao_id INTO v_existing_active_org FROM private.user_org_memberships
       WHERE user_id = v_existing_user AND ativo = true LIMIT 1;

      IF v_existing_active_org IS NOT NULL THEN
        IF v_existing_active_org = v_orgao THEN
          RAISE EXCEPTION 'USER_ALREADY_MEMBER_OF_ORGANIZATION' USING ERRCODE = '23505';
        ELSE
          RAISE EXCEPTION 'USER_ALREADY_LINKED_TO_ANOTHER_ORGANIZATION' USING ERRCODE = '23505';
        END IF;
      END IF;
    END IF;
  END;

  INSERT INTO private.team_invitations (
    orgao_execucao_id, email, email_normalizado, nome_completo,
    matricula, funcao_interna, outra_funcao, telefone,
    status, invited_by, idempotency_key, correlation_id
  ) VALUES (
    v_orgao, p_email, v_email_norm, p_nome_completo,
    NULLIF(btrim(p_matricula), ''), p_funcao_interna,
    CASE WHEN p_funcao_interna='outro' THEN btrim(p_outra_funcao) ELSE NULL END,
    NULLIF(btrim(p_telefone),''),
    'preparando', v_uid, COALESCE(p_idempotency_key, gen_random_uuid()), v_corr
  ) RETURNING id INTO v_new_id;

  PERFORM private.log_audit_event(
    'team.invitation_created', 'team_invitation', v_new_id::text,
    'sucesso', NULL,
    jsonb_build_object(
      'orgao_id', v_orgao,
      'email_dominio', split_part(v_email_norm, '@', 2),
      'funcao_interna', p_funcao_interna,
      'justificativa', CASE WHEN v_is_tec THEN btrim(p_justificativa) ELSE NULL END
    ),
    v_orgao, v_corr, v_actor_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_new_id,
    'orgao_id', v_orgao,
    'email', v_email_norm,
    'correlation_id', v_corr
  );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_convite_equipe(text,text,text,text,text,text,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_convite_equipe(text,text,text,text,text,text,uuid,text,uuid) TO authenticated;

-- 5.2 Registro de envio (chamado pela edge function após inviteUserByEmail)
CREATE OR REPLACE FUNCTION public.registrar_envio_convite(
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_status public.team_invitation_status,
  p_failure_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv private.team_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM private.team_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  IF v_inv.invited_by <> v_uid AND NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE private.team_invitations
     SET status = p_status,
         auth_user_id = COALESCE(p_auth_user_id, auth_user_id),
         sent_at = CASE WHEN p_status = 'enviado' THEN now() ELSE sent_at END,
         failure_code = CASE WHEN p_status = 'falhou' THEN p_failure_code ELSE NULL END
   WHERE id = p_invitation_id;

  PERFORM private.log_audit_event(
    CASE WHEN p_status = 'enviado' THEN 'team.invitation_sent' ELSE 'team.invitation_failed' END,
    'team_invitation', p_invitation_id::text,
    CASE WHEN p_status = 'enviado' THEN 'sucesso'::public.audit_result ELSE 'falha'::public.audit_result END,
    NULL,
    jsonb_build_object('failure_code', p_failure_code),
    v_inv.orgao_execucao_id, v_inv.correlation_id, NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_envio_convite(uuid,uuid,public.team_invitation_status,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_envio_convite(uuid,uuid,public.team_invitation_status,text) TO authenticated;

-- 5.3 Reenvio de convite (rate limited)
CREATE OR REPLACE FUNCTION public.reenviar_convite_equipe(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv private.team_invitations%ROWTYPE;
  v_daily integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_inv FROM private.team_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE='02000'; END IF;

  IF v_inv.status NOT IN ('preparando','enviado','falhou','expirado') THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_ACCEPTED' USING ERRCODE='22023';
  END IF;

  IF NOT (private.is_admin_tecnico() OR
          (private.is_defensor_publico() AND
           v_inv.orgao_execucao_id = private.current_active_org_id())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF v_inv.last_resent_at IS NOT NULL AND now() - v_inv.last_resent_at < interval '60 seconds' THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE='53400';
  END IF;

  SELECT count(*) INTO v_daily FROM private.audit_events
   WHERE entity = 'team_invitation' AND entity_id = p_invitation_id::text
     AND action = 'team.invitation_resent' AND at > now() - interval '1 day';
  IF v_daily >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE='53400';
  END IF;

  UPDATE private.team_invitations
     SET resend_count = resend_count + 1,
         last_resent_at = now(),
         status = 'preparando',
         expires_at = now() + interval '7 days',
         failure_code = NULL
   WHERE id = p_invitation_id;

  PERFORM private.log_audit_event(
    'team.invitation_resent','team_invitation', p_invitation_id::text,
    'sucesso', NULL, NULL, v_inv.orgao_execucao_id, v_inv.correlation_id, NULL
  );

  RETURN jsonb_build_object('ok', true, 'invitation_id', p_invitation_id,
    'email', v_inv.email, 'auth_user_id', v_inv.auth_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reenviar_convite_equipe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reenviar_convite_equipe(uuid) TO authenticated;

-- 5.4 Cancelamento
CREATE OR REPLACE FUNCTION public.cancelar_convite_equipe(p_invitation_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv private.team_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mín. 5 caracteres).' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_inv FROM private.team_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE='02000'; END IF;

  IF v_inv.status NOT IN ('preparando','enviado','falhou') THEN
    RAISE EXCEPTION 'Convite não pode ser cancelado neste estado.' USING ERRCODE='22023';
  END IF;

  IF NOT (private.is_admin_tecnico() OR
          (private.is_defensor_publico() AND
           v_inv.orgao_execucao_id = private.current_active_org_id())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  UPDATE private.team_invitations
     SET status='cancelado', cancelled_at=now(), cancelled_by=v_uid,
         motivo_cancelamento=btrim(p_motivo)
   WHERE id=p_invitation_id;

  PERFORM private.log_audit_event(
    'team.invitation_cancelled','team_invitation', p_invitation_id::text,
    'sucesso', NULL, jsonb_build_object('motivo', btrim(p_motivo)),
    v_inv.orgao_execucao_id, v_inv.correlation_id, NULL
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_convite_equipe(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_convite_equipe(uuid,text) TO authenticated;

-- 5.5 Ativação pelo próprio membro
CREATE OR REPLACE FUNCTION public.completar_onboarding_equipe(p_aceite_termos boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv private.team_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_aceite_termos IS NOT TRUE THEN
    RAISE EXCEPTION 'É necessário aceitar os termos institucionais.' USING ERRCODE='22023';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_inv FROM private.team_invitations
   WHERE email_normalizado = v_email
     AND status IN ('preparando','enviado')
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE private.team_invitations SET status='expirado' WHERE id=v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE='22023';
  END IF;

  -- Garantir que não haja vínculo ativo (dupla proteção)
  IF EXISTS (SELECT 1 FROM private.user_org_memberships
             WHERE user_id = v_uid AND ativo = true) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE='23505';
  END IF;

  -- Criar/completar profile
  INSERT INTO public.profiles (user_id, nome_completo, matricula, telefone,
                               funcao_interna, outra_funcao, status, ativo)
  VALUES (v_uid, v_inv.nome_completo, v_inv.matricula, v_inv.telefone,
          v_inv.funcao_interna, v_inv.outra_funcao, 'ativo', true)
  ON CONFLICT (user_id) DO UPDATE SET
    nome_completo = COALESCE(public.profiles.nome_completo, EXCLUDED.nome_completo),
    matricula = COALESCE(public.profiles.matricula, EXCLUDED.matricula),
    telefone = COALESCE(public.profiles.telefone, EXCLUDED.telefone),
    funcao_interna = COALESCE(public.profiles.funcao_interna, EXCLUDED.funcao_interna),
    outra_funcao = COALESCE(public.profiles.outra_funcao, EXCLUDED.outra_funcao),
    status = 'ativo',
    ativo = true,
    updated_at = now();

  -- Atribuir papel
  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (v_uid, 'membro_equipe', v_inv.invited_by, v_inv.correlation_id)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at=NULL, revoked_by=NULL;

  -- Criar vínculo
  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by, correlation_id)
  VALUES (v_uid, v_inv.orgao_execucao_id, v_inv.invited_by, v_inv.correlation_id);

  UPDATE private.team_invitations
     SET status='aceito', accepted_at=now(), auth_user_id=v_uid
   WHERE id=v_inv.id;

  PERFORM private.log_audit_event(
    'team.member_activated','profile', v_uid::text,
    'sucesso', NULL,
    jsonb_build_object('invitation_id', v_inv.id),
    v_inv.orgao_execucao_id, v_inv.correlation_id, 'membro_equipe'
  );

  RETURN jsonb_build_object('ok', true, 'orgao_id', v_inv.orgao_execucao_id);
END;
$$;
REVOKE ALL ON FUNCTION public.completar_onboarding_equipe(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.completar_onboarding_equipe(boolean) TO authenticated;

-- 5.6 Listar equipe (Defensor / Admin Técnico)
CREATE OR REPLACE FUNCTION public.listar_equipe(p_orgao_id uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, nome_completo text, email text, matricula text,
  funcao_interna text, outra_funcao text, telefone text,
  status public.profile_status, ativo boolean, membership_id uuid,
  vinculado_em timestamptz, ultimo_acesso timestamptz, orgao_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_orgao uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF private.is_admin_tecnico() OR private.current_user_is_admin() THEN
    v_orgao := p_orgao_id; -- pode ser NULL = todos
  ELSIF private.is_defensor_publico() THEN
    v_orgao := private.current_active_org_id();
    IF v_orgao IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501'; END IF;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT p.user_id, p.nome_completo, u.email::text, p.matricula,
           p.funcao_interna, p.outra_funcao, p.telefone,
           p.status, p.ativo, m.id AS membership_id, m.since AS vinculado_em,
           u.last_sign_in_at AS ultimo_acesso, m.orgao_id
      FROM private.user_org_memberships m
      JOIN public.profiles p ON p.user_id = m.user_id
      JOIN auth.users u ON u.id = m.user_id
      JOIN private.user_roles r ON r.user_id = m.user_id
        AND r.role='membro_equipe' AND r.revoked_at IS NULL
     WHERE m.ativo = true
       AND (v_orgao IS NULL OR m.orgao_id = v_orgao)
     ORDER BY p.nome_completo NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.listar_equipe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_equipe(uuid) TO authenticated;

-- 5.7 Listar convites do órgão
CREATE OR REPLACE FUNCTION public.listar_convites_equipe(p_orgao_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, orgao_execucao_id uuid, email text, nome_completo text,
  matricula text, funcao_interna text, outra_funcao text, telefone text,
  status public.team_invitation_status, invited_by uuid, sent_at timestamptz,
  expires_at timestamptz, resend_count integer, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_orgao uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF private.is_admin_tecnico() OR private.current_user_is_admin() THEN
    v_orgao := p_orgao_id;
  ELSIF private.is_defensor_publico() THEN
    v_orgao := private.current_active_org_id();
    IF v_orgao IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501'; END IF;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  -- expirar convites antigos on-read
  UPDATE private.team_invitations SET status='expirado'
   WHERE status IN ('preparando','enviado') AND expires_at < now()
     AND (v_orgao IS NULL OR orgao_execucao_id = v_orgao);

  RETURN QUERY
    SELECT ti.id, ti.orgao_execucao_id, ti.email, ti.nome_completo,
           ti.matricula, ti.funcao_interna, ti.outra_funcao, ti.telefone,
           ti.status, ti.invited_by, ti.sent_at, ti.expires_at,
           ti.resend_count, ti.created_at
      FROM private.team_invitations ti
     WHERE (v_orgao IS NULL OR ti.orgao_execucao_id = v_orgao)
     ORDER BY ti.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.listar_convites_equipe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_convites_equipe(uuid) TO authenticated;

-- 5.8 Bloquear / Reativar / Encerrar
CREATE OR REPLACE FUNCTION public.bloquear_membro_equipe(p_user_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório.' USING ERRCODE='22023';
  END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_org_memberships
   WHERE user_id=p_user_id AND ativo=true LIMIT 1;

  UPDATE public.profiles
     SET status='suspenso', ativo=false, suspenso_em=now(),
         motivo_bloqueio=btrim(p_motivo), updated_at=now()
   WHERE user_id=p_user_id;

  PERFORM private.log_audit_event(
    'team.member_blocked','profile', p_user_id::text,
    'sucesso', NULL, jsonb_build_object('motivo', btrim(p_motivo)),
    v_org, gen_random_uuid(), NULL
  );
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.bloquear_membro_equipe(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bloquear_membro_equipe(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reativar_membro_equipe(p_user_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_org_memberships
   WHERE user_id=p_user_id AND ativo=true LIMIT 1;

  UPDATE public.profiles
     SET status='ativo', ativo=true, suspenso_em=NULL,
         motivo_bloqueio=NULL, updated_at=now()
   WHERE user_id=p_user_id;

  PERFORM private.log_audit_event(
    'team.member_reactivated','profile', p_user_id::text,
    'sucesso', NULL, jsonb_build_object('motivo', btrim(COALESCE(p_motivo,''))),
    v_org, gen_random_uuid(), NULL
  );
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.reativar_membro_equipe(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reativar_membro_equipe(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.encerrar_vinculo_membro(p_user_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_mid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório.' USING ERRCODE='22023';
  END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT id, orgao_id INTO v_mid, v_org FROM private.user_org_memberships
   WHERE user_id=p_user_id AND ativo=true LIMIT 1;
  IF v_mid IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE='02000'; END IF;

  UPDATE private.user_org_memberships
     SET ativo=false, until=now(), ended_by=v_uid,
         motivo_encerramento=btrim(p_motivo)
   WHERE id=v_mid;

  UPDATE public.profiles SET status='inativo', ativo=false, inativado_em=now(), updated_at=now()
   WHERE user_id=p_user_id;

  PERFORM private.log_audit_event(
    'team.membership_ended','user_org_membership', v_mid::text,
    'sucesso', NULL, jsonb_build_object('motivo', btrim(p_motivo)),
    v_org, gen_random_uuid(), NULL
  );
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.encerrar_vinculo_membro(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encerrar_vinculo_membro(uuid,text) TO authenticated;

-- 5.9 Editar dados funcionais do membro
CREATE OR REPLACE FUNCTION public.atualizar_membro_equipe(
  p_user_id uuid, p_nome_completo text, p_matricula text,
  p_telefone text, p_funcao_interna text, p_outra_funcao text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_funcao_interna NOT IN ('assessor','servidor','estagiario','residente','colaborador','outro') THEN
    RAISE EXCEPTION 'Função interna inválida.' USING ERRCODE='22023';
  END IF;
  IF p_funcao_interna='outro' AND (p_outra_funcao IS NULL OR btrim(p_outra_funcao)='') THEN
    RAISE EXCEPTION 'Descreva a função quando escolher "outro".' USING ERRCODE='22023';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_org_memberships
   WHERE user_id=p_user_id AND ativo=true LIMIT 1;

  UPDATE public.profiles
     SET nome_completo=regexp_replace(btrim(p_nome_completo), '\s+', ' ', 'g'),
         matricula=NULLIF(btrim(p_matricula),''),
         telefone=NULLIF(btrim(p_telefone),''),
         funcao_interna=p_funcao_interna,
         outra_funcao=CASE WHEN p_funcao_interna='outro' THEN btrim(p_outra_funcao) ELSE NULL END,
         updated_at=now()
   WHERE user_id=p_user_id;

  PERFORM private.log_audit_event(
    'team.member_updated','profile', p_user_id::text,
    'sucesso', NULL, jsonb_build_object('funcao_interna', p_funcao_interna),
    v_org, gen_random_uuid(), NULL
  );
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.atualizar_membro_equipe(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_membro_equipe(uuid,text,text,text,text,text) TO authenticated;

-- ------------------------------------------------------------------------
-- 6. Alteração de órgão pelo Defensor (sem MFA)
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.defensor_alterar_orgao_ativo(
  p_new_orgao_id uuid,
  p_expected_current_membership_id uuid,
  p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current private.user_org_memberships%ROWTYPE;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.is_defensor_publico() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  -- idempotência via audit
  IF p_idempotency_key IS NOT NULL THEN
    SELECT (metadata->>'new_membership_id')::uuid INTO v_existing
      FROM private.audit_events
     WHERE action='defender.organization_changed'
       AND correlation_id = p_idempotency_key
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'membership_id', v_existing);
    END IF;
  END IF;

  -- Verificar órgão
  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id=p_new_orgao_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  SELECT * INTO v_current FROM private.user_org_memberships
   WHERE user_id=v_uid AND ativo=true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501';
  END IF;
  IF p_expected_current_membership_id IS NOT NULL AND v_current.id <> p_expected_current_membership_id THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  IF v_current.orgao_id = p_new_orgao_id THEN
    RAISE EXCEPTION 'SAME_ORGANIZATION' USING ERRCODE='22023';
  END IF;

  UPDATE private.user_org_memberships
     SET ativo=false, until=now(), ended_by=v_uid,
         motivo_encerramento='defensor_alterou_orgao'
   WHERE id=v_current.id;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by, correlation_id)
  VALUES (v_uid, p_new_orgao_id, v_uid, COALESCE(p_idempotency_key, gen_random_uuid()))
  RETURNING id INTO v_existing;

  PERFORM private.log_audit_event(
    'defender.organization_changed','user_org_membership', v_existing::text,
    'sucesso', NULL,
    jsonb_build_object('from_orgao', v_current.orgao_id, 'to_orgao', p_new_orgao_id,
                       'new_membership_id', v_existing),
    p_new_orgao_id, COALESCE(p_idempotency_key, gen_random_uuid()), 'defensor_publico'
  );

  RETURN jsonb_build_object('ok', true, 'membership_id', v_existing,
    'previous_orgao_id', v_current.orgao_id, 'new_orgao_id', p_new_orgao_id);
END; $$;
REVOKE ALL ON FUNCTION public.defensor_alterar_orgao_ativo(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defensor_alterar_orgao_ativo(uuid,uuid,uuid) TO authenticated;

-- ------------------------------------------------------------------------
-- 7. Ver dados de um convite pelo próprio convidado (para tela de ativação)
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_convite_pendente()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv private.team_invitations%ROWTYPE;
  v_org public.orgaos_execucao%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_uid;
  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_inv FROM private.team_invitations
   WHERE email_normalizado=v_email AND status IN ('preparando','enviado')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_org FROM public.orgaos_execucao WHERE id = v_inv.orgao_execucao_id;

  RETURN jsonb_build_object(
    'id', v_inv.id,
    'nome_completo', v_inv.nome_completo,
    'funcao_interna', v_inv.funcao_interna,
    'outra_funcao', v_inv.outra_funcao,
    'email', v_inv.email,
    'expires_at', v_inv.expires_at,
    'expirado', v_inv.expires_at < now(),
    'orgao', jsonb_build_object('id', v_org.id, 'nome', v_org.nome, 'comarca', v_org.comarca)
  );
END; $$;
REVOKE ALL ON FUNCTION public.meu_convite_pendente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meu_convite_pendente() TO authenticated;
