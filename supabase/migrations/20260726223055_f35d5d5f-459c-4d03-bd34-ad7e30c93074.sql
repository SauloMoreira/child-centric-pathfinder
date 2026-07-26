
-- Helper: AAL2 gate (raises if user has verified factor but current session isn't aal2)
CREATE OR REPLACE FUNCTION private.require_aal2_if_enrolled(p_user uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_has_factor boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
     WHERE user_id = p_user AND status = 'verified'
  ) INTO v_has_factor;
  IF v_has_factor AND COALESCE((auth.jwt()->>'aal'),'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'AAL2_REQUIRED' USING ERRCODE = '28000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_aal2_if_enrolled(uuid) FROM PUBLIC;

-- =========================
-- ITEM 1: admin_assign_defensor_role — restaurar gate AAL2
-- =========================
CREATE OR REPLACE FUNCTION public.admin_assign_defensor_role(
  p_target_user_id uuid, p_orgao_execucao_id uuid,
  p_matricula text DEFAULT NULL::text,
  p_justificativa text DEFAULT NULL::text,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_correlation uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_profile public.profiles%ROWTYPE;
  v_email text;
  v_email_confirmed boolean;
  v_current_role public.app_role;
  v_prev_membership private.user_org_memberships%ROWTYPE;
  v_membership_id uuid;
  v_orgao public.orgaos_execucao%ROWTYPE;
  v_matricula text;
  v_actor_role public.app_role;
  v_profile_status public.profile_status;
  v_activation_pending boolean;
  v_code text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Gate MFA restaurado: exige AAL2 se o ator já tem fator verificado.
  PERFORM private.require_aal2_if_enrolled(v_actor);

  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_justificativa IS NOT NULL AND char_length(btrim(p_justificativa)) BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_MINIMA_10_CARACTERES' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_email_confirmed
  FROM auth.users u WHERE u.id = p_target_user_id;

  SELECT * INTO v_orgao FROM public.orgaos_execucao WHERE id = p_orgao_execucao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT ur.role INTO v_current_role
  FROM private.user_roles ur
  WHERE ur.user_id = p_target_user_id AND ur.revoked_at IS NULL
  ORDER BY CASE ur.role
    WHEN 'admin_tecnico' THEN 1
    WHEN 'admin_institucional' THEN 2
    WHEN 'defensor_publico' THEN 3
    WHEN 'membro_equipe' THEN 4
  END LIMIT 1;

  IF v_current_role IN ('admin_tecnico','admin_institucional') THEN
    RAISE EXCEPTION 'USER_HAS_INCOMPATIBLE_ROLE' USING ERRCODE = '42501';
  END IF;

  v_matricula := COALESCE(NULLIF(btrim(p_matricula), ''), NULLIF(btrim(v_profile.matricula), ''));
  IF v_matricula IS NULL OR v_matricula = 'N/D' THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:matricula' USING ERRCODE = '22023';
  END IF;

  IF v_profile.nome_completo IS NULL OR char_length(btrim(v_profile.nome_completo)) < 5 THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:nome_completo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev_membership
  FROM private.user_org_memberships
  WHERE user_id = p_target_user_id AND ativo = true FOR UPDATE;

  IF v_current_role = 'defensor_publico'
     AND FOUND
     AND v_prev_membership.orgao_id = p_orgao_execucao_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyApplied', true,
      'code', 'DEFENDER_ROLE_ALREADY_ASSIGNED',
      'targetUserId', p_target_user_id,
      'role', 'defensor_publico',
      'organization', jsonb_build_object(
        'id', v_orgao.id, 'nome', v_orgao.nome, 'comarca', v_orgao.comarca
      ),
      'correlationId', v_correlation
    );
  END IF;

  IF FOUND THEN
    UPDATE private.user_org_memberships
       SET ativo = false, until = now(), ended_by = v_actor,
           motivo_encerramento = COALESCE(p_justificativa,'Atribuição de Defensor Público'),
           correlation_id = v_correlation,
           updated_at = now()
     WHERE id = v_prev_membership.id;
  END IF;

  IF v_current_role = 'membro_equipe' THEN
    UPDATE private.user_roles
       SET revoked_at = now(), revoked_by = v_actor, correlation_id = v_correlation
     WHERE user_id = p_target_user_id AND role = 'membro_equipe' AND revoked_at IS NULL;
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (p_target_user_id, 'defensor_publico'::public.app_role, v_actor, v_correlation)
  ON CONFLICT (user_id, role) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL,
        granted_by = EXCLUDED.granted_by, granted_at = now(),
        correlation_id = EXCLUDED.correlation_id;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, ativo, since, granted_by, correlation_id)
  VALUES (p_target_user_id, p_orgao_execucao_id, true, now(), v_actor, v_correlation)
  RETURNING id INTO v_membership_id;

  IF v_email_confirmed THEN
    v_profile_status := 'ativo'::public.profile_status;
    v_activation_pending := false;
    v_code := 'DEFENDER_ROLE_ASSIGNED';
  ELSE
    v_profile_status := 'aguardando_aprovacao'::public.profile_status;
    v_activation_pending := true;
    v_code := 'ROLE_ASSIGNED_EMAIL_CONFIRMATION_PENDING';
  END IF;

  PERFORM set_config('reintegra.admin_op','1', true);
  UPDATE public.profiles
     SET matricula = v_matricula,
         cargo = COALESCE(NULLIF(cargo, ''), 'Defensor Público'),
         status = v_profile_status,
         ativo = (v_profile_status = 'ativo'::public.profile_status),
         updated_at = now()
   WHERE user_id = p_target_user_id;
  PERFORM set_config('reintegra.admin_op','0', true);

  SELECT ur.role INTO v_actor_role FROM private.user_roles ur
   WHERE ur.user_id = v_actor AND ur.revoked_at IS NULL LIMIT 1;

  PERFORM private.log_audit_event(
    p_action => 'user.role_assigned',
    p_entity => 'user',
    p_entity_id => p_target_user_id::text,
    p_result => 'sucesso',
    p_changed_fields => jsonb_build_array('role','orgao_execucao_id','status','matricula'),
    p_metadata => jsonb_build_object(
      'previous_role', COALESCE(v_current_role::text,'sem_papel'),
      'new_role', 'defensor_publico',
      'orgao_execucao_id', p_orgao_execucao_id,
      'membership_id', v_membership_id,
      'profile_status', v_profile_status::text,
      'email_confirmed', v_email_confirmed,
      'justificativa_len', COALESCE(char_length(btrim(p_justificativa)),0)
    ),
    p_orgao_id => p_orgao_execucao_id,
    p_correlation_id => v_correlation,
    p_actor_role => v_actor_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'activationPending', v_activation_pending,
    'targetUserId', p_target_user_id,
    'role', 'defensor_publico',
    'profileStatus', v_profile_status::text,
    'membershipStatus', CASE WHEN v_activation_pending THEN 'pendente_confirmacao' ELSE 'ativo' END,
    'organization', jsonb_build_object(
      'id', v_orgao.id, 'nome', v_orgao.nome, 'comarca', v_orgao.comarca
    ),
    'correlationId', v_correlation
  );
END;
$function$;

-- =========================
-- ITEM 2: admin_create_orgao_execucao — adicionar gate AAL2
-- =========================
CREATE OR REPLACE FUNCTION public.admin_create_orgao_execucao(
  p_nome text, p_comarca text, p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_nome         text := btrim(coalesce(p_nome, ''));
  v_comarca      text := btrim(coalesce(p_comarca, ''));
  v_nome_norm    text;
  v_comarca_norm text;
  v_orgao_id     uuid;
  v_comarca_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_aal2_if_enrolled(v_uid);

  IF length(v_nome) < 3    THEN RAISE EXCEPTION 'INVALID_NAME'    USING ERRCODE='22023'; END IF;
  IF length(v_comarca) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_nome_norm    := lower(regexp_replace(v_nome, '\s+', ' ', 'g'));
  v_comarca_norm := private.normalize_comarca_nome(v_comarca);

  SELECT id INTO v_orgao_id
    FROM public.orgaos_execucao
   WHERE nome_normalizado = v_nome_norm AND comarca_normalizada = v_comarca_norm
   LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'DUPLICATE_ORGAO' USING ERRCODE='23505'; END IF;

  INSERT INTO public.orgaos_execucao (nome, comarca, created_by)
  VALUES (v_nome, v_comarca, v_uid) RETURNING id INTO v_orgao_id;

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_comarca, v_comarca_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (v_orgao_id, v_comarca_id, true, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO NOTHING;

  PERFORM private.log_audit_event(
    'orgao.created', 'orgao_execucao', v_orgao_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object('nome', v_nome, 'comarca', v_comarca),
    v_orgao_id, NULL, private.current_user_role()
  );

  RETURN jsonb_build_object('success', true, 'orgao_id', v_orgao_id, 'comarca_id', v_comarca_id);
END
$function$;

-- ITEM 2 (b): admin_add_comarca_to_orgao — adicionar gate AAL2
CREATE OR REPLACE FUNCTION public.admin_add_comarca_to_orgao(
  p_orgao_id uuid, p_comarca_nome text,
  p_is_principal boolean DEFAULT false,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := btrim(coalesce(p_comarca_nome, ''));
  v_norm text;
  v_comarca_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  PERFORM private.require_aal2_if_enrolled(v_uid);

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF length(v_nome) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_norm := private.normalize_comarca_nome(v_nome);

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_nome, v_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  IF p_is_principal THEN
    UPDATE public.orgao_comarcas SET is_principal = false
     WHERE orgao_execucao_id = p_orgao_id AND is_principal = true;
  END IF;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (p_orgao_id, v_comarca_id, p_is_principal, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO UPDATE
    SET is_principal = EXCLUDED.is_principal OR public.orgao_comarcas.is_principal;

  PERFORM private.log_audit_event(
    'orgao.comarca_added', 'orgao_execucao', p_orgao_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object('comarca_id', v_comarca_id, 'is_principal', p_is_principal),
    p_orgao_id, NULL, private.current_user_role()
  );

  RETURN jsonb_build_object('success', true, 'comarca_id', v_comarca_id);
END
$function$;

-- =========================
-- ITEM 3: usar contexto operacional atual do ator para gestão de equipe
-- =========================

CREATE OR REPLACE FUNCTION private.user_can_manage_team_member(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF private.is_admin_tecnico() THEN RETURN true; END IF;
  IF NOT private.is_defensor_publico() THEN RETURN false; END IF;

  SELECT orgao_id INTO v_ctx_org
    FROM private.user_operational_context
   WHERE user_id = v_uid;

  IF v_ctx_org IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM private.user_org_memberships
     WHERE user_id = v_uid AND orgao_id = v_ctx_org AND ativo = true
  ) AND EXISTS (
    SELECT 1 FROM private.user_org_memberships
     WHERE user_id = p_target_user_id AND orgao_id = v_ctx_org AND ativo = true
  );
END;
$function$;

-- criar_convite_equipe: branch do defensor usa contexto operacional
CREATE OR REPLACE FUNCTION public.criar_convite_equipe(
  p_nome_completo text, p_email text, p_matricula text,
  p_funcao_interna text, p_outra_funcao text, p_telefone text,
  p_orgao_id uuid, p_justificativa text, p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE user_id = v_uid AND status = 'ativo' AND ativo = true) THEN
    RAISE EXCEPTION 'USER_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  IF v_is_def THEN
    SELECT orgao_id INTO v_defensor_org
      FROM private.user_operational_context
     WHERE user_id = v_uid;
    IF v_defensor_org IS NULL
       OR NOT EXISTS (SELECT 1 FROM private.user_org_memberships
                       WHERE user_id = v_uid AND orgao_id = v_defensor_org AND ativo = true) THEN
      RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE = '42501';
    END IF;
    v_orgao := v_defensor_org;
    v_actor_role := 'defensor_publico';
  ELSE
    IF p_orgao_id IS NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    IF p_justificativa IS NULL OR char_length(btrim(p_justificativa)) < 10 THEN
      RAISE EXCEPTION 'Justificativa obrigatória para acesso técnico global.' USING ERRCODE = '22023';
    END IF;
    v_orgao := p_orgao_id;
    v_actor_role := 'admin_tecnico';
  END IF;

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

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND lower(email) = v_email_norm) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = v_orgao) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM private.team_invitations
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'invitation_id', v_existing_id);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM private.team_invitations
             WHERE orgao_execucao_id = v_orgao
               AND email_normalizado = v_email_norm
               AND status IN ('preparando','enviado')) THEN
    RAISE EXCEPTION 'TEAM_INVITATION_ALREADY_PENDING' USING ERRCODE = '23505';
  END IF;

  DECLARE
    v_existing_user uuid;
    v_existing_active_org uuid;
    v_has_incompat boolean;
  BEGIN
    SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email_norm LIMIT 1;
    IF v_existing_user IS NOT NULL THEN
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
$function$;

-- bloquear_membro_equipe: v_org do ator via user_operational_context
CREATE OR REPLACE FUNCTION public.bloquear_membro_equipe(p_user_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório.' USING ERRCODE='22023';
  END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_operational_context WHERE user_id = v_uid;

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
END; $function$;

-- reativar_membro_equipe
CREATE OR REPLACE FUNCTION public.reativar_membro_equipe(p_user_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_operational_context WHERE user_id = v_uid;

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
END; $function$;

-- encerrar_vinculo_membro: encerra o vínculo do alvo NO órgão do contexto do ator
CREATE OR REPLACE FUNCTION public.encerrar_vinculo_membro(p_user_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_mid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório.' USING ERRCODE='22023';
  END IF;
  IF NOT private.user_can_manage_team_member(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_id INTO v_org FROM private.user_operational_context WHERE user_id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501'; END IF;

  SELECT id INTO v_mid FROM private.user_org_memberships
   WHERE user_id = p_user_id AND orgao_id = v_org AND ativo = true LIMIT 1;
  IF v_mid IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE='02000'; END IF;

  UPDATE private.user_org_memberships
     SET ativo=false, until=now(), ended_by=v_uid,
         motivo_encerramento=btrim(p_motivo)
   WHERE id=v_mid;

  -- Só marca perfil como inativo se o alvo não permanecer com outros vínculos ativos.
  IF NOT EXISTS (
    SELECT 1 FROM private.user_org_memberships
     WHERE user_id = p_user_id AND ativo = true
  ) THEN
    UPDATE public.profiles SET status='inativo', ativo=false, inativado_em=now(), updated_at=now()
     WHERE user_id=p_user_id;
  END IF;

  PERFORM private.log_audit_event(
    'team.membership_ended','user_org_membership', v_mid::text,
    'sucesso', NULL, jsonb_build_object('motivo', btrim(p_motivo)),
    v_org, gen_random_uuid(), NULL
  );
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- atualizar_membro_equipe: v_org do ator via contexto operacional
CREATE OR REPLACE FUNCTION public.atualizar_membro_equipe(
  p_user_id uuid, p_nome_completo text, p_matricula text,
  p_telefone text, p_funcao_interna text, p_outra_funcao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  SELECT orgao_id INTO v_org FROM private.user_operational_context WHERE user_id = v_uid;

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
END; $function$;
