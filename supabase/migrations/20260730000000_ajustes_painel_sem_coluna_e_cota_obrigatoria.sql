-- Ajuste 4 (Área de Trabalho): criar_painel não cria mais coluna padrão —
-- o Painel nasce vazio; o usuário cria a primeira coluna manualmente.
--
-- Ajuste 8 (Cota): título, texto e categoria deixam de ser opcionais.
-- criar_cota/atualizar_cota passam a exigir corpo de texto não vazio e ao
-- menos uma categoria explicitamente selecionada — removido o fallback
-- silencioso para "Sem categoria" nessas duas RPCs (a categoria "Sem
-- categoria" continua existindo como reserva do sistema/legado, apenas não
-- é mais atribuída automaticamente quando o usuário não escolhe nenhuma).

-- ---------------------------------------------------------------------------
-- 1) criar_painel — sem criação automática de coluna
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_painel(
  p_defensor_user_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL,
  p_expected_count integer DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_lock_key bigint;
  v_count int; v_pos int; v_id uuid;
  v_name text; v_icon text; v_name_norm text;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_name := private.validate_panel_name(p_nome);
  v_icon := private.validate_panel_icon(p_icone);
  v_name_norm := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*) INTO v_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  IF p_expected_count IS NOT NULL AND p_expected_count <> v_count THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'PANEL_LIMIT_REACHED' USING ERRCODE='23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.defensor_workspaces
              WHERE defensor_user_id = p_defensor_user_id
                AND archived_at IS NULL
                AND nome_normalizado = v_name_norm) THEN
    RAISE EXCEPTION 'PANEL_NAME_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  INSERT INTO public.defensor_workspaces (defensor_user_id, nome, icone, order_position)
  VALUES (p_defensor_user_id, v_name, v_icon, v_pos)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('panel.created','defensor_workspace',
    v_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('position', v_pos), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object(
      'panelId', v_id, 'initialColumnId', NULL,
      'orderPosition', v_pos, 'optimisticVersion', 1);
    PERFORM private.complete_idempotency(v_actor,'panel.create',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) criar_cota — texto e categoria passam a ser obrigatórios
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_cota(
  p_titulo       text,
  p_body_json    jsonb,
  p_body_text    text,
  p_category_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_item  uuid;
  v_ver   uuid;
  v_cats  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_defensor(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023';
  END IF;
  IF p_body_text IS NULL OR length(trim(p_body_text)) = 0 THEN
    RAISE EXCEPTION 'INVALID_BODY' USING ERRCODE='22023';
  END IF;

  v_cats := COALESCE((SELECT array_agg(DISTINCT c) FROM unnest(p_category_ids) AS c), ARRAY[]::uuid[]);

  IF array_length(v_cats, 1) IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_REQUIRED' USING ERRCODE='22023';
  ELSIF EXISTS (
    SELECT 1 FROM unnest(v_cats) cid
     WHERE NOT EXISTS (SELECT 1 FROM public.content_categories cc WHERE cc.id = cid AND cc.kind = 'cota')
  ) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.content_items
    (kind, category_id, owner_user_id, orgao_id, visibility, status, optimistic_version)
  VALUES
    ('cota', v_cats[1], v_uid, NULL, 'equipe', 'publicado', 1)
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, created_by, is_published, published_at)
  VALUES
    (v_item, 1, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), trim(p_body_text), v_uid, true, now())
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         current_published_version_id = v_ver,
         updated_at = now()
   WHERE id = v_item;

  INSERT INTO public.content_item_categories (item_id, category_id)
  SELECT v_item, cid FROM unnest(v_cats) cid;

  PERFORM private.log_audit_event(
    'cota.criada', 'cota', v_item::text, 'sucesso', NULL,
    jsonb_build_object('categoria_ids', v_cats), NULL, NULL, NULL
  );

  RETURN jsonb_build_object('item_id', v_item, 'version_id', v_ver);
END;
$fn$;

REVOKE ALL ON FUNCTION public.criar_cota(text, jsonb, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_cota(text, jsonb, text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) atualizar_cota — mesmas validações obrigatórias na edição
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_cota(
  p_item_id          uuid,
  p_expected_version bigint,
  p_idempotency_key  uuid,
  p_titulo           text,
  p_body_json        jsonb,
  p_body_text        text,
  p_category_ids     uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_owner        uuid;
  v_kind         public.content_kind;
  v_new_version  bigint;
  v_ver          uuid;
  v_next_ver_num int;
  v_cats         uuid[];
  v_replay       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT owner_user_id, kind INTO v_owner, v_kind
    FROM public.content_items WHERE id = p_item_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'COTA_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_kind <> 'cota' THEN
    RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE='22023';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE='42501';
  END IF;
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023';
  END IF;
  IF p_body_text IS NULL OR length(trim(p_body_text)) = 0 THEN
    RAISE EXCEPTION 'INVALID_BODY' USING ERRCODE='22023';
  END IF;

  v_replay := private.claim_idempotency(v_uid, 'cota.update', p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_cats := COALESCE((SELECT array_agg(DISTINCT c) FROM unnest(p_category_ids) AS c), ARRAY[]::uuid[]);
  IF array_length(v_cats, 1) IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_REQUIRED' USING ERRCODE='22023';
  ELSIF EXISTS (
    SELECT 1 FROM unnest(v_cats) cid
     WHERE NOT EXISTS (SELECT 1 FROM public.content_categories cc WHERE cc.id = cid AND cc.kind = 'cota')
  ) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE='22023';
  END IF;

  UPDATE public.content_items
     SET optimistic_version = optimistic_version + 1
   WHERE id = p_item_id AND optimistic_version = p_expected_version
   RETURNING optimistic_version INTO v_new_version;

  IF v_new_version IS NULL THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next_ver_num
    FROM public.content_versions WHERE item_id = p_item_id;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, created_by, is_published, published_at)
  VALUES
    (p_item_id, v_next_ver_num, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), trim(p_body_text), v_uid, true, now())
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         current_published_version_id = v_ver,
         category_id = v_cats[1],
         updated_at = now()
   WHERE id = p_item_id;

  DELETE FROM public.content_item_categories WHERE item_id = p_item_id;
  INSERT INTO public.content_item_categories (item_id, category_id)
  SELECT p_item_id, cid FROM unnest(v_cats) cid;

  PERFORM private.log_audit_event(
    'cota.editada', 'cota', p_item_id::text, 'sucesso', NULL,
    jsonb_build_object('version_number', v_next_ver_num, 'categoria_ids', v_cats), NULL, NULL, NULL
  );

  PERFORM private.complete_idempotency(v_uid, 'cota.update', p_idempotency_key,
    jsonb_build_object('optimisticVersion', v_new_version, 'versionId', v_ver, 'versionNumber', v_next_ver_num));

  RETURN jsonb_build_object('optimisticVersion', v_new_version, 'versionId', v_ver, 'versionNumber', v_next_ver_num);
END;
$fn$;

REVOKE ALL ON FUNCTION public.atualizar_cota(uuid, bigint, uuid, text, jsonb, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_cota(uuid, bigint, uuid, text, jsonb, text, uuid[]) TO authenticated;
