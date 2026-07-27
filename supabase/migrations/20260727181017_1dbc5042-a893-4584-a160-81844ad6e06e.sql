CREATE OR REPLACE FUNCTION public.listar_painel_completo(
  p_panel_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_ws record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;
  IF p_panel_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT w.id, w.defensor_user_id, w.nome, w.icone, w.optimistic_version, w.archived_at
    INTO v_ws
  FROM public.defensor_workspaces w
  WHERE w.id = p_panel_id;

  IF NOT FOUND OR v_ws.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PANEL_NOT_FOUND');
  END IF;

  IF NOT private.can_view_workspace(v_caller, v_ws.id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.order_position, c.created_at), '[]'::jsonb)
    INTO v_columns
  FROM (
    SELECT id, workspace_id, nome, descricao, cor, cor_token, order_position, created_at
    FROM public.defensor_workspace_columns
    WHERE workspace_id = p_panel_id
    ORDER BY order_position, created_at
  ) c;

  SELECT COALESCE(jsonb_agg(row_to_json(k)::jsonb ORDER BY k.order_position, k.created_at), '[]'::jsonb)
    INTO v_cards
  FROM (
    SELECT id AS card_id, workspace_id, column_id, item_id, order_position, created_at
    FROM public.defensor_workspace_cards
    WHERE workspace_id = p_panel_id
    ORDER BY column_id, order_position, created_at
  ) k;

  RETURN jsonb_build_object(
    'ok', true,
    'panelId', v_ws.id,
    'defenderUserId', v_ws.defensor_user_id,
    'panelName', v_ws.nome,
    'panelIcon', v_ws.icone,
    'optimisticVersion', v_ws.optimistic_version,
    'columns', v_columns,
    'cards', v_cards
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listar_painel_completo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_painel_completo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_painel_completo(uuid) TO authenticated;