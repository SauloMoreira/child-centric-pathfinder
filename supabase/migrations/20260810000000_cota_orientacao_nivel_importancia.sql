-- Ajuste doc (AJUSTE 7) — grau de importância da Orientação: "media"
-- (Âmbar, padrão) ou "alta" (Bordô). Já existe para Orientação/Checklist
-- de Atendimento (campo `nivelImportancia` dentro do form_schema JSONB,
-- sem migration necessária). Para a Cota, a orientação vive numa coluna
-- própria por versão (content_versions.orientacao), então o nível
-- acompanha na mesma granularidade.

ALTER TABLE public.content_versions
  ADD COLUMN IF NOT EXISTS orientacao_nivel text NOT NULL DEFAULT 'media';

ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_orientacao_nivel_check
  CHECK (orientacao_nivel IN ('media', 'alta'));

-- criar_cota/atualizar_cota ganham p_orientacao_nivel — mesmo cuidado da
-- migration anterior: contagem de parâmetros muda, então as assinaturas
-- antigas precisam ser derrubadas antes de recriar (senão CREATE OR
-- REPLACE cria um overload extra em vez de substituir).
DROP FUNCTION IF EXISTS public.criar_cota(text, jsonb, text, uuid[], text);
DROP FUNCTION IF EXISTS public.atualizar_cota(uuid, bigint, uuid, text, jsonb, text, uuid[], text);

CREATE FUNCTION public.criar_cota(
  p_titulo            text,
  p_body_json         jsonb,
  p_body_text         text,
  p_category_ids      uuid[] DEFAULT NULL,
  p_orientacao        text DEFAULT NULL,
  p_orientacao_nivel  text DEFAULT 'media'
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
  v_nivel text := CASE WHEN p_orientacao_nivel = 'alta' THEN 'alta' ELSE 'media' END;
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
     WHERE NOT EXISTS (SELECT 1 FROM public.content_categories cc WHERE cc.id = cid)
  ) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.content_items
    (kind, category_id, owner_user_id, orgao_id, visibility, status, optimistic_version)
  VALUES
    ('cota', v_cats[1], v_uid, NULL, 'equipe', 'publicado', 1)
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, orientacao, orientacao_nivel, created_by, is_published, published_at)
  VALUES
    (v_item, 1, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), trim(p_body_text),
     NULLIF(trim(COALESCE(p_orientacao, '')), ''), v_nivel, v_uid, true, now())
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

REVOKE ALL ON FUNCTION public.criar_cota(text, jsonb, text, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_cota(text, jsonb, text, uuid[], text, text) TO authenticated;

CREATE FUNCTION public.atualizar_cota(
  p_item_id           uuid,
  p_expected_version  bigint,
  p_idempotency_key   uuid,
  p_titulo            text,
  p_body_json         jsonb,
  p_body_text         text,
  p_category_ids      uuid[] DEFAULT NULL,
  p_orientacao        text DEFAULT NULL,
  p_orientacao_nivel  text DEFAULT 'media'
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
  v_nivel        text := CASE WHEN p_orientacao_nivel = 'alta' THEN 'alta' ELSE 'media' END;
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
     WHERE NOT EXISTS (SELECT 1 FROM public.content_categories cc WHERE cc.id = cid)
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
    (item_id, version_number, title, body_json, body_text, orientacao, orientacao_nivel, created_by, is_published, published_at)
  VALUES
    (p_item_id, v_next_ver_num, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), trim(p_body_text),
     NULLIF(trim(COALESCE(p_orientacao, '')), ''), v_nivel, v_uid, true, now())
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

REVOKE ALL ON FUNCTION public.atualizar_cota(uuid, bigint, uuid, text, jsonb, text, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_cota(uuid, bigint, uuid, text, jsonb, text, uuid[], text, text) TO authenticated;

-- obter_cota_detalhe passa a devolver orientacaoNivel também.
CREATE OR REPLACE FUNCTION public.obter_cota_detalhe(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_item       record;
  v_ver        record;
  v_cats       jsonb;
  v_owner_name text;
  v_can_view   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_item FROM public.content_items WHERE id = p_item_id AND kind = 'cota' AND deleted_at IS NULL;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COTA_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  v_can_view := (v_item.owner_user_id = v_uid)
    OR private.user_can_act_for_defensor(v_uid, v_item.owner_user_id, NULL)
    OR private.current_user_has_role('admin_tecnico'::public.app_role);

  IF NOT v_can_view THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_ver FROM public.content_versions WHERE id = v_item.current_version_id;
  SELECT nome_completo INTO v_owner_name FROM public.profiles WHERE user_id = v_item.owner_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.order_position), '[]'::jsonb)
    INTO v_cats
    FROM public.content_item_categories cic
    JOIN public.content_categories cc ON cc.id = cic.category_id
   WHERE cic.item_id = v_item.id;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'titulo', COALESCE(v_ver.title, '(sem título)'),
    'bodyJson', v_ver.body_json,
    'bodyText', v_ver.body_text,
    'orientacao', v_ver.orientacao,
    'orientacaoNivel', COALESCE(v_ver.orientacao_nivel, 'media'),
    'categorias', v_cats,
    'ownerUserId', v_item.owner_user_id,
    'ownerDisplayName', COALESCE(v_owner_name, ''),
    'updatedAt', v_item.updated_at,
    'optimisticVersion', v_item.optimistic_version,
    'canEdit', (v_item.owner_user_id = v_uid)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.obter_cota_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_cota_detalhe(uuid) TO authenticated;
