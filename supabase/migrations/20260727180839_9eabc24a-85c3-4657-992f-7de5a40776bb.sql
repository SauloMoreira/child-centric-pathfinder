-- defender_panels_read_api
-- RPC de leitura pura da Área de Trabalho do Defensor.

CREATE OR REPLACE FUNCTION public.listar_area_trabalho_defensor(
  p_defensor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_active boolean;
  v_defensor_exists boolean;
  v_access_mode text := NULL;
  v_is_owner boolean := false;
  v_is_admin_tecnico boolean := false;
  v_is_member_bound boolean := false;
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

  -- Caller must have an active profile
  SELECT (status = 'ativo'::public.profile_status)
    INTO v_caller_active
  FROM public.profiles
  WHERE user_id = v_caller;

  IF NOT COALESCE(v_caller_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Target defensor must exist and be an active defensor
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = p_defensor_user_id
      AND p.status = 'ativo'::public.profile_status
      AND public.tem_papel_usuario(p.user_id, 'defensor_publico'::public.app_role)
  ) INTO v_defensor_exists;

  IF NOT v_defensor_exists THEN
    -- Fallback: some deployments expose tem_papel only for auth.uid();
    -- if the helper above does not exist we fall back to a direct check.
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = p_defensor_user_id
        AND p.status = 'ativo'::public.profile_status
        AND ur.role = 'defensor_publico'::public.app_role
        AND (ur.revoked_at IS NULL)
    ) INTO v_defensor_exists;
  END IF;

  IF NOT v_defensor_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Determine access mode
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
    -- Team member: needs active bond + operational context pointing to defensor
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
  ELSIF v_is_member_bound THEN
    v_access_mode := 'team_readonly';
  ELSIF v_is_admin_tecnico THEN
    v_access_mode := 'technical_readonly';
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Load active panels
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.order_position, t.created_at), '[]'::jsonb),
         COUNT(*)::int
    INTO v_panels, v_panel_count
  FROM (
    SELECT w.id,
           w.defensor_user_id,
           w.nome,
           w.icone,
           w.order_position,
           w.optimistic_version,
           w.archived_at,
           w.created_at
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
        'canEditWorkspace', v_is_owner,
        'canManagePanels', v_is_owner,
        'canManageColumns', v_is_owner,
        'canMoveCards', v_is_owner,
        'canAddItems', v_is_owner
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
      'canEditWorkspace', v_is_owner,
      'canManagePanels', v_is_owner,
      'canManageColumns', v_is_owner,
      'canMoveCards', v_is_owner,
      'canAddItems', v_is_owner
    )
  );
EXCEPTION WHEN undefined_function THEN
  -- If helper tem_papel_usuario doesn't exist, we already fell back above.
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_area_trabalho_defensor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_area_trabalho_defensor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_area_trabalho_defensor(uuid) TO authenticated;