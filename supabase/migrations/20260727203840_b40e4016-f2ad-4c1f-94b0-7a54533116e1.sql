
-- 1) Workspace access: admin_tecnico ganha capacidades completas como 'technical_admin'
CREATE OR REPLACE FUNCTION private.user_workspace_access(p_user uuid, p_workspace_id uuid)
 RETURNS TABLE(can_view boolean, can_edit_workspace boolean, can_manage_columns boolean, can_move_cards boolean, can_add_items boolean, access_mode text, defensor_user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_def uuid;
  v_ctx_defensor uuid;
BEGIN
  SELECT w.defensor_user_id INTO v_def
    FROM public.defensor_workspaces w
   WHERE w.id = p_workspace_id AND w.archived_at IS NULL;
  IF v_def IS NULL THEN
    RETURN QUERY SELECT false,false,false,false,false,'none'::text,NULL::uuid;
    RETURN;
  END IF;

  IF v_def = p_user AND private.user_is_active_defensor(p_user) THEN
    RETURN QUERY SELECT true,true,true,true,true,'owner'::text, v_def;
    RETURN;
  END IF;

  -- Administrador Técnico: acesso administrativo completo
  IF private.current_user_has_role('admin_tecnico') THEN
    RETURN QUERY SELECT true,true,true,true,true,'technical_admin'::text, v_def;
    RETURN;
  END IF;

  SELECT dc.defensor_user_id INTO v_ctx_defensor
    FROM public.defensor_context dc WHERE dc.user_id = p_user;

  IF private.user_is_active_team_member(p_user)
     AND private.active_member_defensor_bond_exists(p_user, v_def)
     AND v_ctx_defensor = v_def THEN
    RETURN QUERY SELECT true,false,false,false,false,'team_readonly'::text, v_def;
    RETURN;
  END IF;

  RETURN QUERY SELECT false,false,false,false,false,'none'::text, v_def;
END $function$;

-- 2) listar_area_trabalho_defensor: admin_tecnico → 'technical_admin' com capabilities completas
CREATE OR REPLACE FUNCTION public.listar_area_trabalho_defensor(p_defensor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_active boolean;
  v_defensor_exists boolean;
  v_access_mode text := NULL;
  v_is_owner boolean := false;
  v_is_admin_tecnico boolean := false;
  v_is_member_bound boolean := false;
  v_can_edit boolean := false;
  v_panels jsonb;
  v_panel_count int;
  v_active_panel_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF p_defensor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT (status = 'ativo'::public.profile_status)
    INTO v_caller_active
  FROM public.profiles
  WHERE user_id = v_caller;

  IF NOT COALESCE(v_caller_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = p_defensor_user_id
      AND p.status = 'ativo'::public.profile_status
      AND ur.role = 'defensor_publico'::public.app_role
      AND (ur.revoked_at IS NULL)
  ) INTO v_defensor_exists;

  IF NOT v_defensor_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  v_is_owner := (v_caller = p_defensor_user_id);

  IF NOT v_is_owner THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_caller
        AND ur.role = 'admin_tecnico'::public.app_role
        AND ur.revoked_at IS NULL
    ) INTO v_is_admin_tecnico;
  END IF;

  IF NOT v_is_owner AND NOT v_is_admin_tecnico THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.member_defensor_bonds b
      JOIN public.defensor_context dc ON dc.user_id = v_caller
      WHERE b.member_user_id = v_caller
        AND b.defensor_user_id = p_defensor_user_id
        AND b.status = 'ativo'::public.member_defensor_bond_status
        AND dc.defensor_user_id = p_defensor_user_id
    ) INTO v_is_member_bound;
  END IF;

  IF v_is_owner THEN
    v_access_mode := 'owner';
    v_can_edit := true;
  ELSIF v_is_admin_tecnico THEN
    v_access_mode := 'technical_admin';
    v_can_edit := true;
  ELSIF v_is_member_bound THEN
    v_access_mode := 'team_readonly';
    v_can_edit := false;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.order_position, t.created_at), '[]'::jsonb),
         COUNT(*)::int
    INTO v_panels, v_panel_count
  FROM (
    SELECT w.id, w.defensor_user_id, w.nome, w.icone, w.order_position,
           w.optimistic_version, w.archived_at, w.created_at
    FROM public.defensor_workspaces w
    WHERE w.defensor_user_id = p_defensor_user_id
      AND w.archived_at IS NULL
    ORDER BY w.order_position, w.created_at
  ) t;

  IF v_panel_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'WORK_AREA_NOT_INITIALIZED',
      'access', jsonb_build_object(
        'accessMode', v_access_mode,
        'canView', true,
        'canEditWorkspace', v_can_edit,
        'canManagePanels', v_can_edit,
        'canManageColumns', v_can_edit,
        'canMoveCards', v_can_edit,
        'canAddItems', v_can_edit
      )
    );
  END IF;

  SELECT (v_panels->0->>'id')::uuid INTO v_active_panel_id;

  RETURN jsonb_build_object(
    'ok', true,
    'defenderUserId', p_defensor_user_id,
    'panelCount', v_panel_count,
    'activePanelId', v_active_panel_id,
    'panels', v_panels,
    'access', jsonb_build_object(
      'accessMode', v_access_mode,
      'canView', true,
      'canEditWorkspace', v_can_edit,
      'canManagePanels', v_can_edit,
      'canManageColumns', v_can_edit,
      'canMoveCards', v_can_edit,
      'canAddItems', v_can_edit
    )
  );
END;
$function$;

-- 3) selecionar_contexto_defensor: admin_tecnico → 'technical_admin' e persiste contexto
CREATE OR REPLACE FUNCTION public.selecionar_contexto_defensor(p_defensor_user_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_claim jsonb;
  v_result jsonb;
  v_mode text;
  v_bond_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_is_active(v_uid) THEN RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF p_defensor_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_DEFENDER_CONTEXT' USING ERRCODE='22023'; END IF;
  IF NOT private.user_is_active_defensor(p_defensor_user_id) THEN
    RAISE EXCEPTION 'DEFENDER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  v_claim := private.claim_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  IF p_defensor_user_id = v_uid AND private.user_is_active_defensor(v_uid) THEN
    v_mode := 'owner';
  ELSIF private.tem_papel(v_uid,'admin_tecnico') THEN
    v_mode := 'technical_admin';
  ELSIF private.user_is_active_team_member(v_uid)
    AND private.active_member_defensor_bond_exists(v_uid, p_defensor_user_id) THEN
    v_mode := 'team';
    SELECT orgao_id INTO v_bond_org FROM public.member_defensor_bonds
      WHERE member_user_id=v_uid AND defensor_user_id=p_defensor_user_id
        AND status='ativo' AND ended_at IS NULL LIMIT 1;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  -- Descobrir orgao para persistir contexto (defensor_context.orgao_id é NOT NULL)
  IF v_bond_org IS NULL THEN
    SELECT orgao_id INTO v_bond_org
      FROM private.user_operational_context WHERE user_id = p_defensor_user_id;
  END IF;
  IF v_bond_org IS NULL THEN
    -- Fallback para technical_admin quando defensor não tem contexto operacional:
    -- usa qualquer órgão de execução existente apenas como âncora do contexto do admin.
    IF v_mode = 'technical_admin' THEN
      SELECT id INTO v_bond_org FROM public.orgaos_execucao ORDER BY created_at LIMIT 1;
    END IF;
  END IF;

  IF v_bond_org IS NULL THEN
    RAISE EXCEPTION 'INVALID_DEFENDER_CONTEXT' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.defensor_context (user_id, defensor_user_id, orgao_id)
  VALUES (v_uid, p_defensor_user_id, v_bond_org)
  ON CONFLICT (user_id) DO UPDATE
     SET defensor_user_id = EXCLUDED.defensor_user_id,
         orgao_id         = EXCLUDED.orgao_id,
         updated_at       = now();

  PERFORM private.log_audit_event(
    CASE WHEN v_mode='technical_admin'
         THEN 'admin.technical_defender_context_selected'
         ELSE 'user.defender_context_selected' END,
    'defensor_context', v_uid::text,
    'sucesso', NULL,
    jsonb_build_object('defensor_user_id', p_defensor_user_id, 'mode', v_mode),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'DEFENDER_CONTEXT_SELECTED',
    'defenderUserId', p_defensor_user_id,
    'mode', v_mode,
    'accessMode', v_mode
  );

  PERFORM private.complete_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key, v_result);
  RETURN v_result;
END $function$;

-- 4) listar_membros_do_defensor: admin_tecnico → 'technical_admin' com poder de vincular/encerrar
CREATE OR REPLACE FUNCTION public.listar_membros_do_defensor(p_defensor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_access_mode := 'technical_admin';
    v_can_link := true;
    v_can_end  := true;
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
END $function$;
