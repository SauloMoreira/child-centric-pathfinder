-- ============================================================
-- Múltiplos quadros (workspaces) por órgão de execução
-- ============================================================

-- 1) Estender listar_workspace(p_orgao_id, p_workspace_id)
DROP FUNCTION IF EXISTS public.listar_workspace(uuid);

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
     WHERE orgao_execucao_id = v_org AND is_default = true LIMIT 1;
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
      'nome', v_ws.nome, 'is_default', v_ws.is_default, 'version', v_ws.version,
      'updated_by', v_ws.updated_by, 'updated_at', v_ws.updated_at
    ),
    'columns', v_cols,
    'can_edit', v_can_edit
  );
END $$;
REVOKE ALL ON FUNCTION public.listar_workspace(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspace(uuid, uuid) TO authenticated;

-- 2) listar_workspaces_orgao(p_orgao_id)
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

  SELECT coalesce(jsonb_agg(row_to_json(w) ORDER BY w.is_default DESC, w.created_at ASC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT id, orgao_execucao_id, nome, is_default, version, created_at, updated_at
        FROM private.orgao_workspaces
       WHERE orgao_execucao_id = v_org
       ORDER BY is_default DESC, created_at ASC
    ) w;

  RETURN jsonb_build_object(
    'orgao_execucao_id', v_org,
    'can_edit', v_can_edit,
    'workspaces', v_items
  );
END $$;
REVOKE ALL ON FUNCTION public.listar_workspaces_orgao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspaces_orgao(uuid) TO authenticated;

-- 3) criar_workspace(p_orgao_id, p_nome)
CREATE OR REPLACE FUNCTION public.criar_workspace(p_orgao_id uuid, p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_ws_id uuid;
  v_nome text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_edit_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_nome := btrim(coalesce(p_nome, ''));
  IF v_nome = '' THEN v_nome := 'Novo quadro'; END IF;
  IF char_length(v_nome) > 80 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;

  -- Garantir que exista o padrão do órgão (para nunca ficar sem default)
  PERFORM public.ensure_default_workspace(v_org);

  INSERT INTO private.orgao_workspaces (orgao_execucao_id, nome, is_default, created_by, updated_by)
  VALUES (v_org, v_nome, false, v_uid, v_uid)
  RETURNING id INTO v_ws_id;

  INSERT INTO private.orgao_workspace_columns
    (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
  VALUES (v_ws_id, 'Todas as crianças e adolescentes',
          'Todos os assistidos cadastrados neste órgão de execução.',
          'neutral', '{}'::jsonb, 0, true, v_uid);

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.created', 'orgao_workspace', v_ws_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('nome', v_nome));

  RETURN jsonb_build_object('id', v_ws_id, 'nome', v_nome, 'orgao_execucao_id', v_org);
END $$;
REVOKE ALL ON FUNCTION public.criar_workspace(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_workspace(uuid, text) TO authenticated;

-- 4) renomear_workspace(p_workspace_id, p_nome)
CREATE OR REPLACE FUNCTION public.renomear_workspace(p_workspace_id uuid, p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_nome text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);
  v_nome := btrim(coalesce(p_nome, ''));
  IF v_nome = '' OR char_length(v_nome) > 80 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;

  UPDATE private.orgao_workspaces
     SET nome = v_nome, updated_at = now(), updated_by = v_uid, version = version + 1
   WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.renamed', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('nome', v_nome));

  RETURN jsonb_build_object('id', p_workspace_id, 'nome', v_nome);
END $$;
REVOKE ALL ON FUNCTION public.renomear_workspace(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renomear_workspace(uuid, text) TO authenticated;

-- 5) excluir_workspace(p_workspace_id)
CREATE OR REPLACE FUNCTION public.excluir_workspace(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_is_default boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);

  SELECT is_default INTO v_is_default FROM private.orgao_workspaces WHERE id = p_workspace_id;
  IF v_is_default THEN RAISE EXCEPTION 'CANNOT_DELETE_DEFAULT_WORKSPACE' USING ERRCODE='P0001'; END IF;

  DELETE FROM private.orgao_workspaces WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.deleted', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.excluir_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_workspace(uuid) TO authenticated;

-- 6) duplicar_workspace(p_workspace_id, p_nome)
CREATE OR REPLACE FUNCTION public.duplicar_workspace(p_workspace_id uuid, p_nome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src RECORD;
  v_org uuid;
  v_new_id uuid;
  v_nome text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_src FROM private.orgao_workspaces WHERE id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := v_src.orgao_execucao_id;
  IF NOT private.user_can_edit_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_nome := btrim(coalesce(p_nome, v_src.nome || ' (cópia)'));
  IF v_nome = '' OR char_length(v_nome) > 80 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;

  INSERT INTO private.orgao_workspaces (orgao_execucao_id, nome, is_default, created_by, updated_by)
  VALUES (v_org, v_nome, false, v_uid, v_uid)
  RETURNING id INTO v_new_id;

  INSERT INTO private.orgao_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition,
     position, is_base_column, created_by)
  SELECT v_new_id, title, description, color_token, custom_color, filter_definition,
         position, is_base_column, v_uid
    FROM private.orgao_workspace_columns
   WHERE workspace_id = p_workspace_id
   ORDER BY position;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.duplicated', 'orgao_workspace', v_new_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('source_id', p_workspace_id));

  RETURN jsonb_build_object('id', v_new_id, 'nome', v_nome);
END $$;
REVOKE ALL ON FUNCTION public.duplicar_workspace(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicar_workspace(uuid, text) TO authenticated;

-- 7) definir_workspace_padrao(p_workspace_id)
CREATE OR REPLACE FUNCTION public.definir_workspace_padrao(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);

  UPDATE private.orgao_workspaces
     SET is_default = false, updated_by = v_uid, updated_at = now()
   WHERE orgao_execucao_id = v_org AND is_default = true AND id <> p_workspace_id;

  UPDATE private.orgao_workspaces
     SET is_default = true, updated_by = v_uid, updated_at = now(), version = version + 1
   WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.set_default', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.definir_workspace_padrao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.definir_workspace_padrao(uuid) TO authenticated;