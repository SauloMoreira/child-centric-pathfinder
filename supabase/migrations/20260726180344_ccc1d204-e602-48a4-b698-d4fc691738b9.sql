
-- 1) Atualizar guard trigger para reconhecer contexto administrativo interno
CREATE OR REPLACE FUNCTION public.tg_profiles_guard_institucional_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_role text;
  v_admin_op text;
BEGIN
  v_admin_op := current_setting('reintegra.admin_op', true);
  IF v_admin_op = '1' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ativo  IS DISTINCT FROM OLD.ativo
     OR NEW.suspenso_em    IS DISTINCT FROM OLD.suspenso_em
     OR NEW.inativado_em   IS DISTINCT FROM OLD.inativado_em
     OR NEW.motivo_bloqueio IS DISTINCT FROM OLD.motivo_bloqueio
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Campos institucionais do perfil só podem ser alterados por procedimento administrativo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Recriar a RPC de atribuição
CREATE OR REPLACE FUNCTION public.admin_assign_defensor_role(
  p_target_user_id uuid,
  p_orgao_execucao_id uuid,
  p_matricula text DEFAULT NULL,
  p_justificativa text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
  -- Autenticação
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Autorização
  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Impedir auto-alteração
  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  -- Justificativa mínima quando fornecida
  IF p_justificativa IS NOT NULL AND char_length(btrim(p_justificativa)) BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_MINIMA_10_CARACTERES' USING ERRCODE = '22023';
  END IF;

  -- Perfil-alvo com lock
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- E-mail + confirmação
  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_email_confirmed
  FROM auth.users u WHERE u.id = p_target_user_id;

  -- Órgão
  SELECT * INTO v_orgao FROM public.orgaos_execucao WHERE id = p_orgao_execucao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Papel atual
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

  -- Matrícula obrigatória
  v_matricula := COALESCE(NULLIF(btrim(p_matricula), ''), NULLIF(btrim(v_profile.matricula), ''));
  IF v_matricula IS NULL OR v_matricula = 'N/D' THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:matricula' USING ERRCODE = '22023';
  END IF;

  -- Nome mínimo
  IF v_profile.nome_completo IS NULL OR char_length(btrim(v_profile.nome_completo)) < 5 THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:nome_completo' USING ERRCODE = '22023';
  END IF;

  -- Vínculo ativo prévio
  SELECT * INTO v_prev_membership
  FROM private.user_org_memberships
  WHERE user_id = p_target_user_id AND ativo = true FOR UPDATE;

  -- Idempotência: já defensor no mesmo órgão
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

  -- Encerrar vínculo anterior incompatível
  IF FOUND THEN
    UPDATE private.user_org_memberships
       SET ativo = false, until = now(), ended_by = v_actor,
           motivo_encerramento = COALESCE(p_justificativa,'Atribuição de Defensor Público'),
           correlation_id = v_correlation,
           updated_at = now()
     WHERE id = v_prev_membership.id;
  END IF;

  -- Revogar membro_equipe se aplicável
  IF v_current_role = 'membro_equipe' THEN
    UPDATE private.user_roles
       SET revoked_at = now(), revoked_by = v_actor, correlation_id = v_correlation
     WHERE user_id = p_target_user_id AND role = 'membro_equipe' AND revoked_at IS NULL;
  END IF;

  -- Atribuir defensor_publico (idempotente)
  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (p_target_user_id, 'defensor_publico'::public.app_role, v_actor, v_correlation)
  ON CONFLICT (user_id, role) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL,
        granted_by = EXCLUDED.granted_by, granted_at = now(),
        correlation_id = EXCLUDED.correlation_id;

  -- Novo vínculo
  INSERT INTO private.user_org_memberships (user_id, orgao_id, ativo, since, granted_by, correlation_id)
  VALUES (p_target_user_id, p_orgao_execucao_id, true, now(), v_actor, v_correlation)
  RETURNING id INTO v_membership_id;

  -- Status conforme confirmação de e-mail
  IF v_email_confirmed THEN
    v_profile_status := 'ativo'::public.profile_status;
    v_activation_pending := false;
    v_code := 'DEFENDER_ROLE_ASSIGNED';
  ELSE
    v_profile_status := 'aguardando_aprovacao'::public.profile_status;
    v_activation_pending := true;
    v_code := 'ROLE_ASSIGNED_EMAIL_CONFIRMATION_PENDING';
  END IF;

  -- Atualizar profile com bypass do guard trigger
  PERFORM set_config('reintegra.admin_op','1', true);
  UPDATE public.profiles
     SET matricula = v_matricula,
         cargo = COALESCE(NULLIF(cargo, ''), 'Defensor Público'),
         status = v_profile_status,
         ativo = (v_profile_status = 'ativo'::public.profile_status),
         updated_at = now()
   WHERE user_id = p_target_user_id;
  PERFORM set_config('reintegra.admin_op','0', true);

  -- Auditoria
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
$$;

REVOKE ALL ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) TO authenticated;
