
CREATE OR REPLACE FUNCTION public.create_workspace_column(
  p_workspace_id uuid, p_title text, p_description text DEFAULT NULL,
  p_color_token text DEFAULT 'neutral', p_custom_color text DEFAULT NULL,
  p_filter jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws private.user_workspaces%ROWTYPE;
  v_next_pos int;
  v_id uuid;
  v_filter jsonb;
  v_custom text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = p_workspace_id;
  IF NOT FOUND OR v_ws.user_id <> v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_filter := private.validate_filter_definition(p_filter);
  v_custom := NULLIF(btrim(coalesce(p_custom_color,'')), '');

  SELECT COALESCE(MAX(position),0)+1 INTO v_next_pos
    FROM private.user_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO private.user_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition, position, created_by)
  VALUES (p_workspace_id, btrim(p_title),
          NULLIF(btrim(coalesce(p_description,'')),''),
          COALESCE(p_color_token::public.workspace_color_enum,'neutral'::public.workspace_color_enum),
          v_custom, v_filter, v_next_pos, v_uid)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('workspace.column_created','workspace_column', v_id::text,
    'sucesso', NULL, jsonb_build_object('workspace_id', p_workspace_id,
      'fields_used', (SELECT array_agg(x->>'field') FROM jsonb_array_elements(v_filter->'conditions') x)),
    v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true, 'column_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.update_workspace_column(
  p_column_id uuid, p_version int, p_title text,
  p_description text DEFAULT NULL, p_color_token text DEFAULT 'neutral',
  p_custom_color text DEFAULT NULL, p_filter jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col private.user_workspace_columns%ROWTYPE;
  v_ws private.user_workspaces%ROWTYPE;
  v_filter jsonb;
  v_custom text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_col FROM private.user_workspace_columns WHERE id = p_column_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = v_col.workspace_id;
  IF v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_col.version <> p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;

  IF v_col.is_base_column THEN
    v_filter := '{"version":1,"text":null,"conditions":[]}'::jsonb;
  ELSE
    v_filter := private.validate_filter_definition(p_filter);
  END IF;
  v_custom := NULLIF(btrim(coalesce(p_custom_color,'')), '');

  UPDATE private.user_workspace_columns
     SET title = btrim(p_title),
         description = NULLIF(btrim(coalesce(p_description,'')),''),
         color_token = COALESCE(p_color_token::public.workspace_color_enum, color_token),
         custom_color = v_custom,
         filter_definition = v_filter,
         version = version + 1,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_updated','workspace_column', p_column_id::text,
    'sucesso', NULL, jsonb_build_object('workspace_id', v_ws.id), v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.create_workspace_column(uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_workspace_column(uuid,int,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_column(uuid,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_column(uuid,int,text,text,text,text,jsonb) TO authenticated;
