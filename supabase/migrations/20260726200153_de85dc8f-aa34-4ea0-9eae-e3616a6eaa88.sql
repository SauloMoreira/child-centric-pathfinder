-- ============================================================
-- Bloco A.3: RPCs institucionais + defensor_alterar_orgao_ativo v2
-- ============================================================

-- Helper de idempotência
CREATE OR REPLACE FUNCTION private.claim_idempotency(
  p_actor uuid, p_operation text, p_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row private.idempotency_operations%ROWTYPE;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_row
    FROM private.idempotency_operations
   WHERE actor_user_id = p_actor
     AND operation_name = p_operation
     AND idempotency_key = p_key;

  IF FOUND THEN
    IF v_row.status = 'completed' THEN
      RETURN jsonb_build_object('replay', true, 'result', v_row.result);
    ELSIF v_row.status = 'pending' THEN
      RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE = '55P03';
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO private.idempotency_operations
    (idempotency_key, operation_name, actor_user_id, status)
  VALUES (p_key, p_operation, p_actor, 'pending');
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.complete_idempotency(
  p_actor uuid, p_operation text, p_key uuid, p_result jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  UPDATE private.idempotency_operations
     SET status='completed', result=p_result, completed_at=now()
   WHERE actor_user_id=p_actor AND operation_name=p_operation AND idempotency_key=p_key;
END $$;

-- ============================================================
-- Determinar o órgão-alvo para uma operação de quadro
-- ============================================================
CREATE OR REPLACE FUNCTION private.resolve_workspace_org(p_orgao_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF private.is_admin_tecnico() THEN
    IF p_orgao_id IS NULL THEN
      RAISE EXCEPTION 'ORGAO_ID_REQUIRED' USING ERRCODE='22023';
    END IF;
    RETURN p_orgao_id;
  END IF;

  v_org := private.current_active_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_MEMBERSHIP' USING ERRCODE='P0002';
  END IF;
  RETURN v_org;
END $$;

-- ============================================================
-- DROP das antigas com assinatura diferente
-- ============================================================
DROP FUNCTION IF EXISTS public.ensure_default_workspace(text, uuid);
DROP FUNCTION IF EXISTS public.listar_workspace(text, uuid);

-- ============================================================
-- ensure_default_workspace(p_orgao_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_default_workspace(p_orgao_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_ws  uuid;
BEGIN
  v_org := private.resolve_workspace_org(p_orgao_id);
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_ws FROM private.orgao_workspaces
   WHERE orgao_execucao_id = v_org AND is_default = true LIMIT 1;

  IF v_ws IS NULL THEN
    IF NOT private.user_can_edit_org_workspace(v_org) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
    END IF;
    INSERT INTO private.orgao_workspaces (orgao_execucao_id, created_by)
    VALUES (v_org, v_uid) RETURNING id INTO v_ws;

    INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
    VALUES (v_uid, 'workspace.created', 'orgao_workspace', v_ws::text,
            'sucesso'::public.audit_result, v_org, '{}'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM private.orgao_workspace_columns
                  WHERE workspace_id = v_ws AND is_base_column = true) THEN
    IF private.user_can_edit_org_workspace(v_org) THEN
      INSERT INTO private.orgao_workspace_columns
        (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
      VALUES (v_ws, 'Todas as crianças e adolescentes',
              'Todos os assistidos cadastrados neste órgão de execução.',
              'neutral', '{}'::jsonb,
              coalesce((SELECT max(position)+1 FROM private.orgao_workspace_columns WHERE workspace_id = v_ws), 0),
              true, v_uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('workspace_id', v_ws, 'orgao_execucao_id', v_org);
END $$;
REVOKE ALL ON FUNCTION public.ensure_default_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_workspace(uuid) TO authenticated;

-- ============================================================
-- listar_workspace(p_orgao_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_workspace(p_orgao_id uuid DEFAULT NULL)
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

  SELECT * INTO v_ws FROM private.orgao_workspaces
   WHERE orgao_execucao_id = v_org AND is_default = true LIMIT 1;
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
REVOKE ALL ON FUNCTION public.listar_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspace(uuid) TO authenticated;

-- ============================================================
-- Assertivas: workspace pertence a órgão que o usuário pode editar
-- ============================================================
CREATE OR REPLACE FUNCTION private.assert_can_edit_ws(p_workspace_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT orgao_execucao_id INTO v_org FROM private.orgao_workspaces WHERE id = p_workspace_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT private.user_can_edit_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END $$;

-- ============================================================
-- create_workspace_column
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_workspace_column(
  p_workspace_id uuid,
  p_title        text,
  p_description  text DEFAULT NULL,
  p_color_token  text DEFAULT 'neutral',
  p_custom_color text DEFAULT NULL,
  p_filter       jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_col_id uuid; v_pos int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);
  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023'; END IF;

  SELECT coalesce(max(position)+1, 0) INTO v_pos
    FROM private.orgao_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO private.orgao_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition,
     position, is_base_column, created_by)
  VALUES (p_workspace_id, btrim(p_title), p_description,
          coalesce(p_color_token,'neutral')::public.workspace_color_enum,
          p_custom_color, coalesce(p_filter, '{}'::jsonb),
          v_pos, false, v_uid)
  RETURNING id INTO v_col_id;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1
   WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.column_created', 'orgao_workspace_column', v_col_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('id', v_col_id, 'workspace_id', p_workspace_id);
END $$;
REVOKE ALL ON FUNCTION public.create_workspace_column(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_column(uuid, text, text, text, text, jsonb) TO authenticated;

-- ============================================================
-- update_workspace_column (concorrência otimista)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_workspace_column(
  p_column_id    uuid,
  p_version      integer,
  p_title        text,
  p_description  text  DEFAULT NULL,
  p_color_token  text  DEFAULT 'neutral',
  p_custom_color text  DEFAULT NULL,
  p_filter       jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_ws uuid; v_org uuid; v_new_ver bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT workspace_id INTO v_ws FROM private.orgao_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := private.assert_can_edit_ws(v_ws);

  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023'; END IF;

  UPDATE private.orgao_workspace_columns
     SET title = btrim(p_title),
         description = p_description,
         color_token = coalesce(p_color_token,'neutral')::public.workspace_color_enum,
         custom_color = p_custom_color,
         filter_definition = coalesce(p_filter, '{}'::jsonb),
         version = version + 1,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = p_column_id AND version = p_version
   RETURNING version INTO v_new_ver;

  IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001'; END IF;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1
   WHERE id = v_ws;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.column_updated', 'orgao_workspace_column', p_column_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('id', p_column_id, 'version', v_new_ver);
END $$;
REVOKE ALL ON FUNCTION public.update_workspace_column(uuid, integer, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_column(uuid, integer, text, text, text, text, jsonb) TO authenticated;

-- ============================================================
-- delete_workspace_column
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_workspace_column(p_column_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_ws uuid; v_org uuid; v_is_base boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT workspace_id, is_base_column INTO v_ws, v_is_base
    FROM private.orgao_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_is_base THEN RAISE EXCEPTION 'CANNOT_DELETE_BASE_COLUMN' USING ERRCODE='P0001'; END IF;
  v_org := private.assert_can_edit_ws(v_ws);

  DELETE FROM private.orgao_workspace_columns WHERE id = p_column_id;

  -- normalizar posições
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM private.orgao_workspace_columns WHERE workspace_id = v_ws
  )
  UPDATE private.orgao_workspace_columns c
     SET position = r.new_pos
    FROM ranked r
   WHERE c.id = r.id AND c.position <> r.new_pos;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1 WHERE id = v_ws;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.column_deleted', 'orgao_workspace_column', p_column_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.delete_workspace_column(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_workspace_column(uuid) TO authenticated;

-- ============================================================
-- duplicate_workspace_column
-- ============================================================
CREATE OR REPLACE FUNCTION public.duplicate_workspace_column(p_column_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_src RECORD; v_new_id uuid; v_org uuid; v_pos int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_src FROM private.orgao_workspace_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := private.assert_can_edit_ws(v_src.workspace_id);

  SELECT coalesce(max(position)+1, 0) INTO v_pos
    FROM private.orgao_workspace_columns WHERE workspace_id = v_src.workspace_id;

  INSERT INTO private.orgao_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition,
     position, is_base_column, created_by)
  VALUES (v_src.workspace_id, v_src.title || ' (cópia)', v_src.description, v_src.color_token,
          v_src.custom_color, v_src.filter_definition, v_pos, false, v_uid)
  RETURNING id INTO v_new_id;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1 WHERE id = v_src.workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, metadata)
  VALUES (v_uid, 'workspace.column_duplicated', 'orgao_workspace_column', v_new_id::text,
          'sucesso'::public.audit_result, v_org, jsonb_build_object('source_id', p_column_id));

  RETURN jsonb_build_object('id', v_new_id);
END $$;
REVOKE ALL ON FUNCTION public.duplicate_workspace_column(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_workspace_column(uuid) TO authenticated;

-- ============================================================
-- reorder_workspace_columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.reorder_workspace_columns(p_workspace_id uuid, p_ordered_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_id uuid; v_idx int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);

  SET CONSTRAINTS orgao_wsc_position_unique DEFERRED;
  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE private.orgao_workspace_columns
       SET position = v_idx, updated_by = v_uid, updated_at = now()
     WHERE id = v_id AND workspace_id = p_workspace_id;
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1 WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.columns_reordered', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.reorder_workspace_columns(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_workspace_columns(uuid, uuid[]) TO authenticated;

-- ============================================================
-- reset_workspace_to_default
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_workspace_to_default(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_org := private.assert_can_edit_ws(p_workspace_id);

  DELETE FROM private.orgao_workspace_columns
   WHERE workspace_id = p_workspace_id AND is_base_column = false;

  IF NOT EXISTS (SELECT 1 FROM private.orgao_workspace_columns
                  WHERE workspace_id = p_workspace_id AND is_base_column = true) THEN
    INSERT INTO private.orgao_workspace_columns
      (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
    VALUES (p_workspace_id, 'Todas as crianças e adolescentes',
            'Todos os assistidos cadastrados neste órgão de execução.',
            'neutral', '{}'::jsonb, 0, true, v_uid);
  END IF;

  UPDATE private.orgao_workspaces SET updated_at = now(), updated_by = v_uid, version = version + 1 WHERE id = p_workspace_id;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id)
  VALUES (v_uid, 'workspace.reset', 'orgao_workspace', p_workspace_id::text,
          'sucesso'::public.audit_result, v_org);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.reset_workspace_to_default(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_workspace_to_default(uuid) TO authenticated;

-- ============================================================
-- get_workspace_column_assistidos (adaptado ao novo schema)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_column_assistidos(
  p_column_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_col RECORD; v_org uuid; v_result jsonb;
BEGIN
  SELECT c.*, w.orgao_execucao_id AS org_id
    INTO v_col
    FROM private.orgao_workspace_columns c
    JOIN private.orgao_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := v_col.org_id;
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  -- Filtro básico por enquanto: retorna todos assistidos do órgão (base column) ou aplica
  -- futuros filtros em filter_definition. Mantemos o mesmo contrato de retorno.
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.updated_at DESC)
        FROM (
          SELECT a.id, a.nome_completo, a.nome_social, a.data_nascimento,
                 a.categoria, a.situacao_atual, a.foto_url, a.updated_at
            FROM public.assistidos a
           WHERE a.deleted_at IS NULL
             AND a.orgao_execucao_id = v_org
           ORDER BY a.updated_at DESC
           LIMIT greatest(1, least(coalesce(p_limit,20), 200))
           OFFSET greatest(0, coalesce(p_offset,0))
        ) x
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM public.assistidos a
               WHERE a.deleted_at IS NULL AND a.orgao_execucao_id = v_org)
  ) INTO v_result;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) TO authenticated;

-- ============================================================
-- defensor_alterar_orgao_ativo v2 (sem MFA, sem aprovação)
-- ============================================================
CREATE OR REPLACE FUNCTION public.defensor_alterar_orgao_ativo(
  p_new_orgao_id                   uuid,
  p_expected_current_membership_id uuid,
  p_idempotency_key                uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_current      RECORD;
  v_new_mem_id   uuid;
  v_correlation  uuid := gen_random_uuid();
  v_idem         jsonb;
  v_result       jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  -- Idempotência (retorna resultado anterior se aplicável)
  v_idem := private.claim_idempotency(v_uid, 'defensor_alterar_orgao_ativo', p_idempotency_key);
  IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean = true THEN
    RETURN v_idem->'result';
  END IF;

  IF NOT public.tem_papel('defensor_publico'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND ativo = true) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_new_orgao_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  -- Lock no vínculo atual
  SELECT * INTO v_current
    FROM private.user_org_memberships
   WHERE user_id = v_uid AND ativo = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_MEMBERSHIP' USING ERRCODE='P0002';
  END IF;

  IF v_current.id <> p_expected_current_membership_id THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  IF v_current.orgao_id = p_new_orgao_id THEN
    RAISE EXCEPTION 'SAME_ORGANIZATION' USING ERRCODE='22023';
  END IF;

  -- Encerra vínculo anterior
  UPDATE private.user_org_memberships
     SET ativo = false, until = now(), ended_by = v_uid,
         motivo_encerramento = 'Alteração direta pelo Defensor Público',
         correlation_id = v_correlation, updated_at = now()
   WHERE id = v_current.id;

  -- Cria novo vínculo
  INSERT INTO private.user_org_memberships
    (user_id, orgao_id, ativo, since, granted_by, correlation_id)
  VALUES (v_uid, p_new_orgao_id, true, now(), v_uid, v_correlation)
  RETURNING id INTO v_new_mem_id;

  -- Auditoria (mesmo correlation_id)
  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, orgao_id, correlation_id, metadata)
  VALUES
    (v_uid, 'membership.ended',            'user_org_membership', v_current.id::text,
     'sucesso'::public.audit_result, v_current.orgao_id, v_correlation, jsonb_build_object('novo_orgao_id', p_new_orgao_id)),
    (v_uid, 'membership.created',          'user_org_membership', v_new_mem_id::text,
     'sucesso'::public.audit_result, p_new_orgao_id, v_correlation, jsonb_build_object('orgao_anterior_id', v_current.orgao_id)),
    (v_uid, 'defender.organization_changed','profile',            v_uid::text,
     'sucesso'::public.audit_result, p_new_orgao_id, v_correlation,
     jsonb_build_object('de', v_current.orgao_id, 'para', p_new_orgao_id));

  -- Garante workspace default do novo órgão
  PERFORM public.ensure_default_workspace(p_new_orgao_id);

  v_result := jsonb_build_object(
    'success', true,
    'membership_id', v_new_mem_id,
    'orgao_id', p_new_orgao_id,
    'correlation_id', v_correlation
  );

  PERFORM private.complete_idempotency(v_uid, 'defensor_alterar_orgao_ativo', p_idempotency_key, v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.defensor_alterar_orgao_ativo(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defensor_alterar_orgao_ativo(uuid, uuid, uuid) TO authenticated;

-- ============================================================
-- meu_estado_institucional (com comarcas estruturadas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mem RECORD;
  v_org RECORD;
  v_comarcas jsonb;
  v_papel text;
  v_profile RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('autenticado', false); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;

  SELECT id, orgao_id, since, ativo
    INTO v_mem
    FROM private.user_org_memberships
   WHERE user_id = v_uid AND ativo = true
   ORDER BY since DESC LIMIT 1;

  SELECT role::text INTO v_papel FROM public.user_roles
    WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 1;

  IF v_mem.orgao_id IS NULL THEN
    RETURN jsonb_build_object(
      'autenticado', true,
      'papel', v_papel,
      'profile', to_jsonb(v_profile),
      'membership', NULL, 'orgao', NULL, 'comarcas', '[]'::jsonb,
      'is_admin_tecnico', private.is_admin_tecnico()
    );
  END IF;

  SELECT id, nome INTO v_org FROM public.orgaos_execucao WHERE id = v_mem.orgao_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nome', c.nome, 'principal', oc.is_principal
         ) ORDER BY oc.is_principal DESC, c.nome), '[]'::jsonb)
    INTO v_comarcas
    FROM public.orgao_comarcas oc
    JOIN public.comarcas c ON c.id = oc.comarca_id
   WHERE oc.orgao_execucao_id = v_mem.orgao_id;

  RETURN jsonb_build_object(
    'autenticado', true,
    'papel', v_papel,
    'profile', to_jsonb(v_profile),
    'membership', jsonb_build_object(
      'id', v_mem.id, 'dataInicio', v_mem.since, 'status',
      CASE WHEN v_mem.ativo THEN 'ativo' ELSE 'encerrado' END
    ),
    'orgao', jsonb_build_object('id', v_org.id, 'nome', v_org.nome),
    'comarcas', v_comarcas,
    'is_admin_tecnico', private.is_admin_tecnico()
  );
END $$;
REVOKE ALL ON FUNCTION public.meu_estado_institucional() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meu_estado_institucional() TO authenticated;