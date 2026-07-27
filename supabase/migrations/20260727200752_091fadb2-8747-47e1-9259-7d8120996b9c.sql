
-- =====================================================================
-- Vincular Membro de Equipe a Defensor Público + acesso técnico global
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1) Policy de leitura para Administrador Técnico em member_defensor_bonds
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS member_defensor_bonds_select_technical ON public.member_defensor_bonds;
CREATE POLICY member_defensor_bonds_select_technical
  ON public.member_defensor_bonds
  FOR SELECT TO authenticated
  USING (private.current_user_has_role('admin_tecnico'::public.app_role));

-- ---------------------------------------------------------------------
-- 2) Helper interno: rótulo institucional legível
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.defender_display_label(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'displayName', COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Defensor(a)'),
    'institutionalLabel', NULLIF(btrim(pr.cargo), '')
  )
  FROM public.profiles pr
  WHERE pr.user_id = p_user;
$$;

REVOKE ALL ON FUNCTION private.defender_display_label(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) RPC: listar_defensores_disponiveis_contexto
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_defensores_disponiveis_contexto()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_current uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;

  SELECT defensor_user_id INTO v_current
    FROM public.defensor_context WHERE user_id = v_uid;

  -- Administrador Técnico: todos os Defensores ativos
  IF private.current_user_has_role('admin_tecnico'::public.app_role) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."displayName"), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
          pr.user_id                                                AS "defenderUserId",
          COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Defensor(a)') AS "displayName",
          NULLIF(btrim(pr.cargo), '')                                AS "institutionalLabel",
          (pr.user_id = v_current)                                   AS "isCurrentContext"
        FROM public.profiles pr
        WHERE pr.status = 'ativo'::public.profile_status
          AND pr.ativo = true
          AND private.user_is_active_defensor(pr.user_id)
      ) t;
    RETURN jsonb_build_object('ok', true, 'mode', 'technical', 'items', v_result);
  END IF;

  -- Defensor: apenas o próprio registro
  IF private.user_is_active_defensor(v_uid) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
          pr.user_id                                                AS "defenderUserId",
          COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Defensor(a)') AS "displayName",
          NULLIF(btrim(pr.cargo), '')                                AS "institutionalLabel",
          true                                                       AS "isCurrentContext"
        FROM public.profiles pr
        WHERE pr.user_id = v_uid
      ) t;
    RETURN jsonb_build_object('ok', true, 'mode', 'owner', 'items', v_result);
  END IF;

  -- Membro de equipe: apenas Defensores com vínculo ativo
  IF private.user_is_active_team_member(v_uid) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."displayName"), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT DISTINCT
          pr.user_id                                                AS "defenderUserId",
          COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Defensor(a)') AS "displayName",
          NULLIF(btrim(pr.cargo), '')                                AS "institutionalLabel",
          (pr.user_id = v_current)                                   AS "isCurrentContext"
        FROM public.member_defensor_bonds b
        JOIN public.profiles pr ON pr.user_id = b.defensor_user_id
        WHERE b.member_user_id = v_uid
          AND b.status = 'ativo'::public.member_defensor_bond_status
          AND b.ended_at IS NULL
          AND pr.status = 'ativo'::public.profile_status
          AND pr.ativo = true
          AND private.user_is_active_defensor(pr.user_id)
      ) t;
    RETURN jsonb_build_object('ok', true, 'mode', 'member', 'items', v_result);
  END IF;

  RETURN jsonb_build_object('ok', true, 'mode', 'none', 'items', '[]'::jsonb);
END $fn$;

REVOKE ALL ON FUNCTION public.listar_defensores_disponiveis_contexto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_defensores_disponiveis_contexto() TO authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC: buscar_usuarios_membro_equipe (somente Defensor autorizado)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_usuarios_membro_equipe(p_termo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_termo text;
  v_pattern text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active_defensor(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_termo := btrim(coalesce(p_termo, ''));
  IF char_length(v_termo) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'items', '[]'::jsonb);
  END IF;

  v_pattern := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."displayName"), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        u.id                                                       AS "userId",
        COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Membro')    AS "displayName",
        lower(u.email::text)                                        AS "email",
        EXISTS(
          SELECT 1 FROM public.member_defensor_bonds b
           WHERE b.member_user_id = u.id
             AND b.defensor_user_id = v_uid
             AND b.status = 'ativo'::public.member_defensor_bond_status
             AND b.ended_at IS NULL
        )                                                           AS "alreadyBoundToMe"
      FROM auth.users u
      JOIN public.profiles pr ON pr.user_id = u.id
      WHERE pr.status = 'ativo'::public.profile_status
        AND pr.ativo = true
        AND private.user_is_active_team_member(u.id)
        -- exclui usuários com papéis incompatíveis
        AND NOT EXISTS (
          SELECT 1 FROM private.user_roles ur
           WHERE ur.user_id = u.id
             AND ur.revoked_at IS NULL
             AND ur.role IN (
               'admin_tecnico'::public.app_role,
               'admin_institucional'::public.app_role,
               'defensor_publico'::public.app_role
             )
        )
        AND (
          lower(coalesce(pr.nome_completo, '')) LIKE lower(v_pattern) ESCAPE '\'
          OR lower(u.email::text) LIKE lower(v_pattern) ESCAPE '\'
        )
      ORDER BY pr.nome_completo NULLS LAST
      LIMIT 20
    ) t;

  RETURN jsonb_build_object('ok', true, 'items', v_result);
END $fn$;

REVOKE ALL ON FUNCTION public.buscar_usuarios_membro_equipe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_usuarios_membro_equipe(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: vincular_membro_defensor
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_membro_defensor(
  p_member_user_id uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_replay jsonb;
  v_result jsonb;
  v_bond_id uuid;
  v_default_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active_defensor(v_uid) THEN
    -- Técnico ou qualquer outro papel cai aqui.
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id = v_uid THEN
    RAISE EXCEPTION 'INVALID_MEMBER' USING ERRCODE='22023';
  END IF;

  v_replay := private.claim_idempotency(v_uid, 'team.defender_link_created', p_idempotency_key);
  IF v_replay IS NOT NULL AND (v_replay->>'replay')::boolean THEN
    RETURN v_replay->'result';
  END IF;

  -- Membro precisa existir e ser membro_equipe puro ativo.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.user_id = p_member_user_id
       AND pr.status = 'ativo'::public.profile_status
       AND pr.ativo = true
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT private.user_is_active_team_member(p_member_user_id) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = p_member_user_id
       AND ur.revoked_at IS NULL
       AND ur.role IN (
         'admin_tecnico'::public.app_role,
         'admin_institucional'::public.app_role,
         'defensor_publico'::public.app_role
       )
  ) THEN
    RAISE EXCEPTION 'MEMBER_INCOMPATIBLE_ROLE' USING ERRCODE='42501';
  END IF;

  -- Vínculo ativo já existente?
  IF EXISTS (
    SELECT 1 FROM public.member_defensor_bonds b
     WHERE b.member_user_id = p_member_user_id
       AND b.defensor_user_id = v_uid
       AND b.status = 'ativo'::public.member_defensor_bond_status
       AND b.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE='23505';
  END IF;

  -- orgao_id é NOT NULL no schema atual — usamos o contexto operacional do Defensor.
  SELECT orgao_id INTO v_default_org
    FROM private.user_operational_context WHERE user_id = v_uid;
  IF v_default_org IS NULL THEN
    -- fallback: qualquer órgão em que o Defensor tenha vínculo ativo
    SELECT dom.orgao_id INTO v_default_org
      FROM private.defensor_org_memberships dom
     WHERE dom.defensor_user_id = v_uid
       AND dom.status = 'ativo'
     ORDER BY dom.created_at
     LIMIT 1;
  END IF;
  IF v_default_org IS NULL THEN
    RAISE EXCEPTION 'DEFENDER_HAS_NO_ORG' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.member_defensor_bonds
    (member_user_id, defensor_user_id, orgao_id, status, created_by)
  VALUES
    (p_member_user_id, v_uid, v_default_org, 'ativo'::public.member_defensor_bond_status, v_uid)
  RETURNING id INTO v_bond_id;

  PERFORM private.log_audit_event(
    'team.defender_link_created', 'member_defensor_bond', v_bond_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'member_user_id', p_member_user_id,
      'defensor_user_id', v_uid
    ),
    NULL, gen_random_uuid(), NULL);

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'MEMBERSHIP_CREATED',
    'bondId', v_bond_id,
    'optimisticVersion', 1
  );
  PERFORM private.complete_idempotency(v_uid, 'team.defender_link_created', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.vincular_membro_defensor(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_membro_defensor(uuid,uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC: listar_membros_do_defensor(p_defensor_user_id uuid DEFAULT NULL)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_membros_do_defensor();
DROP FUNCTION IF EXISTS public.listar_membros_do_defensor(uuid);

CREATE FUNCTION public.listar_membros_do_defensor(
  p_defensor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_access_mode text;
  v_can_link boolean := false;
  v_can_end  boolean := false;
  v_members jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;

  -- Determina alvo + modo de acesso
  IF private.user_is_active_defensor(v_uid) THEN
    v_target := COALESCE(p_defensor_user_id, v_uid);
    IF v_target <> v_uid THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
    END IF;
    v_access_mode := 'owner';
    v_can_link := true;
    v_can_end  := true;
  ELSIF private.current_user_has_role('admin_tecnico'::public.app_role) THEN
    IF p_defensor_user_id IS NULL THEN
      RAISE EXCEPTION 'DEFENDER_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF NOT private.user_is_active_defensor(p_defensor_user_id) THEN
      RAISE EXCEPTION 'DEFENDER_NOT_FOUND' USING ERRCODE='P0002';
    END IF;
    v_target := p_defensor_user_id;
    v_access_mode := 'technical_readonly';
    PERFORM private.log_audit_event(
      'defender_team.viewed_technical', 'defensor_team', v_target::text,
      'sucesso'::public.audit_result, NULL,
      jsonb_build_object('defender_user_id', v_target),
      NULL, gen_random_uuid(), NULL);
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."createdAt" DESC), '[]'::jsonb)
    INTO v_members
    FROM (
      SELECT
        b.id                          AS "bondId",
        b.member_user_id              AS "memberUserId",
        COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Membro') AS "displayName",
        lower(u.email::text)           AS "email",
        b.status::text                 AS "status",
        b.created_at                   AS "createdAt",
        b.ended_at                     AS "endedAt",
        b.optimistic_version           AS "optimisticVersion"
      FROM public.member_defensor_bonds b
      JOIN auth.users u        ON u.id = b.member_user_id
      LEFT JOIN public.profiles pr ON pr.user_id = b.member_user_id
      WHERE b.defensor_user_id = v_target
    ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'defenderUserId', v_target,
    'accessMode', v_access_mode,
    'canLinkMembers', v_can_link,
    'canEndBonds', v_can_end,
    'members', v_members
  );
END $fn$;

REVOKE ALL ON FUNCTION public.listar_membros_do_defensor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_membros_do_defensor(uuid) TO authenticated;

COMMIT;
