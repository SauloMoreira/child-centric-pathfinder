
-- =========================================================
-- FASE 2.1 — Atribuição administrativa de papel Defensor
-- =========================================================

-- ---------- Helpers para admins ----------
CREATE OR REPLACE FUNCTION private.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.current_user_has_role('admin_tecnico'::public.app_role)
    OR private.current_user_has_role('admin_institucional'::public.app_role);
$$;

REVOKE ALL ON FUNCTION private.current_user_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_user_is_admin() TO authenticated;

-- ---------- Listagem administrativa consolidada ----------
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  user_id uuid,
  email text,
  email_confirmado boolean,
  nome_completo text,
  matricula text,
  cargo text,
  funcao_interna text,
  outra_funcao text,
  telefone text,
  status public.profile_status,
  ativo boolean,
  role_atual public.app_role,
  orgao_id uuid,
  orgao_nome text,
  orgao_comarca text,
  membership_id uuid,
  vinculado_em timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    u.email::text,
    (u.email_confirmed_at IS NOT NULL) AS email_confirmado,
    p.nome_completo,
    p.matricula,
    p.cargo,
    p.funcao_interna,
    p.outra_funcao,
    p.telefone,
    p.status,
    p.ativo,
    (
      SELECT ur.role
      FROM private.user_roles ur
      WHERE ur.user_id = p.user_id AND ur.revoked_at IS NULL
      ORDER BY
        CASE ur.role
          WHEN 'admin_tecnico'         THEN 1
          WHEN 'admin_institucional'   THEN 2
          WHEN 'defensor_publico'      THEN 3
          WHEN 'membro_equipe'         THEN 4
        END
      LIMIT 1
    ) AS role_atual,
    m.orgao_id,
    oe.nome AS orgao_nome,
    oe.comarca AS orgao_comarca,
    m.id AS membership_id,
    m.since AS vinculado_em,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN private.user_org_memberships m
    ON m.user_id = p.user_id AND m.ativo = true
  LEFT JOIN public.orgaos_execucao oe ON oe.id = m.orgao_id
  ORDER BY p.updated_at DESC
  LIMIT COALESCE(p_limit, 500);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_listar_usuarios(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_listar_usuarios(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_usuarios(integer) TO authenticated;

-- ---------- Detalhe: histórico do usuário ----------
CREATE OR REPLACE FUNCTION public.admin_detalhar_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'user_id', p.user_id,
    'email', u.email,
    'email_confirmado', (u.email_confirmed_at IS NOT NULL),
    'last_sign_in_at', u.last_sign_in_at,
    'profile', to_jsonb(p) - 'user_id',
    'roles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', ur.role,
        'granted_at', ur.granted_at,
        'granted_by', ur.granted_by,
        'revoked_at', ur.revoked_at,
        'revoked_by', ur.revoked_by
      ) ORDER BY ur.granted_at DESC)
      FROM private.user_roles ur WHERE ur.user_id = p.user_id
    ), '[]'::jsonb),
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'orgao_id', m.orgao_id,
        'orgao_nome', oe.nome,
        'orgao_comarca', oe.comarca,
        'ativo', m.ativo,
        'since', m.since,
        'until', m.until,
        'motivo_encerramento', m.motivo_encerramento
      ) ORDER BY m.since DESC)
      FROM private.user_org_memberships m
      LEFT JOIN public.orgaos_execucao oe ON oe.id = m.orgao_id
      WHERE m.user_id = p.user_id
    ), '[]'::jsonb),
    'audit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'at', a.at,
        'action', a.action,
        'result', a.result,
        'changed_fields', a.changed_fields,
        'metadata', a.metadata
      ) ORDER BY a.at DESC)
      FROM private.audit_events a
      WHERE a.entity = 'user' AND a.entity_id = p.user_id::text
      LIMIT 50
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.user_id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_detalhar_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_detalhar_usuario(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_detalhar_usuario(uuid) TO authenticated;

-- ---------- RPC transacional: atribuir Defensor ----------
CREATE OR REPLACE FUNCTION public.admin_assign_defensor_role(
  p_target_user_id      uuid,
  p_orgao_execucao_id   uuid,
  p_matricula           text DEFAULT NULL,
  p_justificativa       text DEFAULT NULL,
  p_idempotency_key     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_aal   text := (auth.jwt() ->> 'aal');
  v_correlation uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_profile public.profiles%ROWTYPE;
  v_email text;
  v_email_confirmed boolean;
  v_current_role public.app_role;
  v_previous_membership private.user_org_memberships%ROWTYPE;
  v_new_membership_id uuid;
  v_orgao public.orgaos_execucao%ROWTYPE;
  v_matricula text;
BEGIN
  -- 1. Autenticação
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- 2. Autorização
  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- 3. MFA (orientativo). Se o executor tiver fator TOTP, exige aal2.
  IF EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = v_actor AND status = 'verified'
  ) AND (v_aal IS DISTINCT FROM 'aal2') THEN
    RAISE EXCEPTION 'AAL2_REQUIRED' USING ERRCODE = '28000';
  END IF;

  -- 4. Auto-promoção
  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  -- 5. Justificativa mínima quando obrigatória
  IF p_justificativa IS NOT NULL AND char_length(btrim(p_justificativa)) < 10 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_MINIMA_10_CARACTERES' USING ERRCODE = '22023';
  END IF;

  -- 6. Trava do perfil-alvo
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 7. E-mail confirmado
  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_email_confirmed
  FROM auth.users u WHERE u.id = p_target_user_id;

  IF NOT v_email_confirmed THEN
    RAISE EXCEPTION 'EMAIL_NOT_CONFIRMED' USING ERRCODE = '28000';
  END IF;

  -- 8. Órgão
  SELECT * INTO v_orgao
  FROM public.orgaos_execucao
  WHERE id = p_orgao_execucao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 9. Papel atual
  SELECT ur.role INTO v_current_role
  FROM private.user_roles ur
  WHERE ur.user_id = p_target_user_id AND ur.revoked_at IS NULL
  ORDER BY
    CASE ur.role
      WHEN 'admin_tecnico'       THEN 1
      WHEN 'admin_institucional' THEN 2
      WHEN 'defensor_publico'    THEN 3
      WHEN 'membro_equipe'       THEN 4
    END
  LIMIT 1;

  IF v_current_role = 'defensor_publico' THEN
    RAISE EXCEPTION 'USER_ALREADY_DEFENDER' USING ERRCODE = '23505';
  END IF;

  IF v_current_role IN ('admin_tecnico','admin_institucional') THEN
    RAISE EXCEPTION 'USER_HAS_INCOMPATIBLE_ROLE' USING ERRCODE = '42501';
  END IF;

  -- 10. Matrícula: obrigatória para Defensor
  v_matricula := COALESCE(NULLIF(btrim(p_matricula), ''), NULLIF(btrim(v_profile.matricula), ''));
  IF v_matricula IS NULL OR v_matricula = 'N/D' THEN
    RAISE EXCEPTION 'INCOMPLETE_PROFILE:matricula' USING ERRCODE = '22023';
  END IF;

  -- Nome mínimo
  IF v_profile.nome_completo IS NULL OR char_length(btrim(v_profile.nome_completo)) < 5 THEN
    RAISE EXCEPTION 'INCOMPLETE_PROFILE:nome_completo' USING ERRCODE = '22023';
  END IF;

  -- 11. Encerrar vínculo ativo prévio (se houver)
  SELECT * INTO v_previous_membership
  FROM private.user_org_memberships
  WHERE user_id = p_target_user_id AND ativo = true
  FOR UPDATE;

  IF FOUND THEN
    UPDATE private.user_org_memberships
    SET ativo = false,
        until = now(),
        ended_by = v_actor,
        motivo_encerramento = COALESCE(p_justificativa, 'Promoção a Defensor Público'),
        correlation_id = v_correlation,
        updated_at = now()
    WHERE id = v_previous_membership.id;

    PERFORM private.log_audit_event(
      p_action => 'user.previous_membership_ended',
      p_entity => 'user',
      p_entity_id => p_target_user_id::text,
      p_result => 'sucesso',
      p_changed_fields => jsonb_build_object('membership_id', v_previous_membership.id),
      p_metadata => jsonb_build_object(
        'previous_orgao_id', v_previous_membership.orgao_id,
        'motivo', COALESCE(p_justificativa,'Promoção a Defensor Público')
      ),
      p_orgao_id => v_previous_membership.orgao_id,
      p_correlation_id => v_correlation
    );
  END IF;

  -- 12. Revogar papel anterior (membro_equipe apenas)
  IF v_current_role = 'membro_equipe' THEN
    UPDATE private.user_roles
    SET revoked_at = now(),
        revoked_by = v_actor,
        correlation_id = v_correlation
    WHERE user_id = p_target_user_id
      AND role = 'membro_equipe'
      AND revoked_at IS NULL;
  END IF;

  -- 13. Atribuir defensor_publico (idempotente)
  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (p_target_user_id, 'defensor_publico'::public.app_role, v_actor, v_correlation)
  ON CONFLICT (user_id, role) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL,
        granted_by = EXCLUDED.granted_by,
        granted_at = now(),
        correlation_id = EXCLUDED.correlation_id;

  -- 14. Novo vínculo ativo
  INSERT INTO private.user_org_memberships
    (user_id, orgao_id, ativo, since, granted_by, correlation_id)
  VALUES
    (p_target_user_id, p_orgao_execucao_id, true, now(), v_actor, v_correlation)
  RETURNING id INTO v_new_membership_id;

  -- 15. Atualizar profile (matrícula + status/ativo)
  UPDATE public.profiles
  SET matricula = v_matricula,
      cargo = COALESCE(NULLIF(cargo, ''), 'Defensor Público'),
      status = 'ativo'::public.profile_status,
      ativo = true,
      updated_at = now(),
      updated_by = v_actor
  WHERE user_id = p_target_user_id;

  -- 16. Auditoria principal
  PERFORM private.log_audit_event(
    p_action => 'user.role_assigned',
    p_entity => 'user',
    p_entity_id => p_target_user_id::text,
    p_result => 'sucesso',
    p_changed_fields => jsonb_build_array('role','orgao_execucao_id','status'),
    p_metadata => jsonb_build_object(
      'previous_role', COALESCE(v_current_role::text,'sem_papel'),
      'new_role', 'defensor_publico',
      'orgao_execucao_id', p_orgao_execucao_id,
      'membership_id', v_new_membership_id,
      'justificativa_len', COALESCE(char_length(btrim(p_justificativa)),0)
    ),
    p_orgao_id => p_orgao_execucao_id,
    p_correlation_id => v_correlation,
    p_actor_role => (SELECT ur.role FROM private.user_roles ur
                     WHERE ur.user_id = v_actor AND ur.revoked_at IS NULL LIMIT 1)
  );

  PERFORM private.log_audit_event(
    p_action => 'user.membership_created',
    p_entity => 'user',
    p_entity_id => p_target_user_id::text,
    p_result => 'sucesso',
    p_changed_fields => jsonb_build_object('membership_id', v_new_membership_id),
    p_metadata => jsonb_build_object('orgao_execucao_id', p_orgao_execucao_id),
    p_orgao_id => p_orgao_execucao_id,
    p_correlation_id => v_correlation
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_target_user_id,
    'new_role', 'defensor_publico',
    'previous_role', COALESCE(v_current_role::text,'sem_papel'),
    'orgao_execucao_id', p_orgao_execucao_id,
    'membership_id', v_new_membership_id,
    'correlation_id', v_correlation
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Auditoria de negação (best-effort, ignora erro)
    BEGIN
      PERFORM private.log_audit_event(
        p_action => 'user.role_assignment_denied',
        p_entity => 'user',
        p_entity_id => COALESCE(p_target_user_id::text, 'unknown'),
        p_result => 'falha',
        p_changed_fields => NULL,
        p_metadata => jsonb_build_object(
          'error_code', SQLSTATE,
          'error_hint', SQLERRM,
          'orgao_execucao_id', p_orgao_execucao_id
        ),
        p_orgao_id => p_orgao_execucao_id,
        p_correlation_id => v_correlation
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_assign_defensor_role(uuid,uuid,text,text,uuid) IS
  'Atribui o papel de Defensor Público a um usuário existente. Transacional. '
  'Somente admin_tecnico/admin_institucional. Exige AAL2 quando o executor '
  'tem MFA verificado. Encerra vínculo anterior de membro_equipe se houver.';
