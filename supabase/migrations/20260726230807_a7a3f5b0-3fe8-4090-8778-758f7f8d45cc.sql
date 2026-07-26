
ALTER TABLE private.orgao_workspaces
  ADD COLUMN IF NOT EXISTS icone text,
  ADD COLUMN IF NOT EXISTS order_position integer;

-- backfill de order_position
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY orgao_execucao_id
    ORDER BY is_default DESC, created_at ASC, id ASC
  ) AS rn
  FROM private.orgao_workspaces
  WHERE order_position IS NULL
)
UPDATE private.orgao_workspaces w
   SET order_position = r.rn
  FROM ranked r WHERE r.id = w.id;

-- listar_workspaces_orgao com icone + order_position
CREATE OR REPLACE FUNCTION public.listar_workspaces_orgao(p_orgao_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_can_edit boolean;
  v_items jsonb;
BEGIN
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_can_edit := private.user_can_edit_org_workspace(v_org);

  SELECT coalesce(jsonb_agg(row_to_json(w) ORDER BY w.order_position NULLS LAST, w.created_at ASC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT id, orgao_execucao_id, nome, icone, is_default, order_position, version, created_at, updated_at
        FROM private.orgao_workspaces
       WHERE orgao_execucao_id = v_org
       ORDER BY order_position NULLS LAST, created_at ASC
    ) w;

  RETURN jsonb_build_object(
    'orgao_execucao_id', v_org,
    'can_edit', v_can_edit,
    'workspaces', v_items
  );
END $$;
REVOKE ALL ON FUNCTION public.listar_workspaces_orgao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspaces_orgao(uuid) TO authenticated;

-- listar_workspace incluindo icone
CREATE OR REPLACE FUNCTION public.listar_workspace(
  p_orgao_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_ws  RECORD;
  v_can_edit boolean;
  v_cols jsonb;
BEGIN
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_can_edit := private.user_can_edit_org_workspace(v_org);

  IF p_workspace_id IS NOT NULL THEN
    SELECT * INTO v_ws FROM private.orgao_workspaces
     WHERE id = p_workspace_id AND orgao_execucao_id = v_org
     LIMIT 1;
  ELSE
    SELECT * INTO v_ws FROM private.orgao_workspaces
     WHERE orgao_execucao_id = v_org
     ORDER BY order_position NULLS LAST, created_at ASC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('workspace', NULL, 'columns', '[]'::jsonb, 'can_edit', v_can_edit);
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.position), '[]'::jsonb) INTO v_cols
    FROM (
      SELECT id, workspace_id, title, description, color_token, custom_color,
             filter_definition, position, is_base_column, version,
             created_by, created_at, updated_by, updated_at
        FROM private.orgao_workspace_columns
       WHERE workspace_id = v_ws.id
       ORDER BY position
    ) c;

  RETURN jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id, 'orgao_execucao_id', v_ws.orgao_execucao_id,
      'nome', v_ws.nome, 'icone', v_ws.icone,
      'is_default', v_ws.is_default, 'version', v_ws.version,
      'updated_by', v_ws.updated_by, 'updated_at', v_ws.updated_at
    ),
    'columns', v_cols,
    'can_edit', v_can_edit
  );
END $$;
REVOKE ALL ON FUNCTION public.listar_workspace(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspace(uuid, uuid) TO authenticated;

-- criar_workspace com icone opcional
DROP FUNCTION IF EXISTS public.criar_workspace(uuid, text);
CREATE OR REPLACE FUNCTION public.criar_workspace(
  p_orgao_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_ws_id uuid;
  v_nome text;
  v_icone text;
  v_next_pos int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_edit_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_nome := btrim(coalesce(p_nome, ''));
  IF v_nome = '' THEN v_nome := 'Novo quadro'; END IF;
  IF char_length(v_nome) > 80 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;
  v_icone := nullif(btrim(coalesce(p_icone, '')), '');
  IF v_icone IS NOT NULL AND char_length(v_icone) > 40 THEN
    RAISE EXCEPTION 'INVALID_ICON' USING ERRCODE='22023';
  END IF;

  PERFORM public.ensure_default_workspace(v_org);

  SELECT coalesce(max(order_position), 0) + 1 INTO v_next_pos
    FROM private.orgao_workspaces WHERE orgao_execucao_id = v_org;

  INSERT INTO private.orgao_workspaces (orgao_execucao_id, nome, icone, is_default, order_position, created_by, updated_by)
  VALUES (v_org, v_nome, v_icone, false, v_next_pos, v_uid, v_uid)
  RETURNING id INTO v_ws_id;

  INSERT INTO private.orgao_workspace_columns
    (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
  VALUES (v_ws_id, 'Todas as crianças e adolescentes',
          'Todos os assistidos cadastrados neste órgão de execução.',
          'neutral', '{}'::jsonb, 0, true, v_uid);

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.created', 'orgao_workspace', v_ws_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('nome', v_nome, 'icone', v_icone));

  RETURN jsonb_build_object('id', v_ws_id, 'nome', v_nome, 'icone', v_icone, 'orgao_execucao_id', v_org);
END $$;
REVOKE ALL ON FUNCTION public.criar_workspace(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_workspace(uuid, text, text) TO authenticated;

-- Atualizar nome + icone
CREATE OR REPLACE FUNCTION public.atualizar_workspace_meta(
  p_workspace_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_nome text; v_icone text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);
  v_nome := btrim(coalesce(p_nome, ''));
  IF v_nome = '' OR char_length(v_nome) > 80 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;
  v_icone := nullif(btrim(coalesce(p_icone, '')), '');
  IF v_icone IS NOT NULL AND char_length(v_icone) > 40 THEN
    RAISE EXCEPTION 'INVALID_ICON' USING ERRCODE='22023';
  END IF;

  UPDATE private.orgao_workspaces
     SET nome = v_nome, icone = v_icone, updated_at = now(), updated_by = v_uid, version = version + 1
   WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.updated', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('nome', v_nome, 'icone', v_icone));

  RETURN jsonb_build_object('id', p_workspace_id, 'nome', v_nome, 'icone', v_icone);
END $$;
REVOKE ALL ON FUNCTION public.atualizar_workspace_meta(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_workspace_meta(uuid, text, text) TO authenticated;

-- excluir_workspace: remove regra de "não excluir padrão"
CREATE OR REPLACE FUNCTION public.excluir_workspace(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);

  DELETE FROM private.orgao_workspaces WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.deleted', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.excluir_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_workspace(uuid) TO authenticated;

-- Reordenar quadros do órgão
CREATE OR REPLACE FUNCTION public.reordenar_workspaces(
  p_orgao_id uuid,
  p_ordered_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_count int;
  v_expected int;
  v_id uuid;
  v_pos int := 1;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_edit_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO v_expected FROM private.orgao_workspaces WHERE orgao_execucao_id = v_org;
  SELECT count(*) INTO v_count
    FROM private.orgao_workspaces
    WHERE orgao_execucao_id = v_org AND id = ANY(p_ordered_ids);
  IF v_count <> v_expected OR v_count <> coalesce(array_length(p_ordered_ids, 1), 0) THEN
    RAISE EXCEPTION 'INVALID_ORDER' USING ERRCODE='22023';
  END IF;

  -- Temporário para evitar conflito de unicidade (se houver)
  UPDATE private.orgao_workspaces
     SET order_position = -1 - order_position
   WHERE orgao_execucao_id = v_org;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE private.orgao_workspaces
       SET order_position = v_pos, updated_by = v_uid, updated_at = now()
     WHERE id = v_id AND orgao_execucao_id = v_org;
    v_pos := v_pos + 1;
  END LOOP;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.reordered', 'orgao_workspace', v_org::text,
          'sucesso'::public.audit_result, v_org,
          jsonb_build_object('ordered_ids', to_jsonb(p_ordered_ids)));

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.reordenar_workspaces(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_workspaces(uuid, uuid[]) TO authenticated;
