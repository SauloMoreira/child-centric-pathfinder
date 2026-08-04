-- Doc bloco novo (AJUSTE 21) — estatísticas de Cotas e Atendimentos,
-- exibidas em uma caixinha flutuante ao passar o mouse no ícone de
-- favoritar: "X acessos / X inserções em painéis / X criados a partir
-- deste(a)".
--
-- "X acessos" já existia (content_items.access_count, incrementado por
-- registrar_acesso_biblioteca — ver 20260815000000_biblioteca_favoritos_
-- ranking.sql). Faltam os outros dois:
--   1) panel_insert_count — quantas vezes, ao todo, o item foi inserido
--      em alguma coluna de algum Painel (contador cumulativo, nunca
--      decrementado ao remover — mesmo espírito do access_count).
--   2) origem_item_id — de qual item este foi "inspirado" (Ajuste doc
--      AJUSTE 9/10, "Inspirar novo atendimento/nova cota"), para poder
--      contar quantos itens foram criados a partir de um item-fonte.

-- ---------------------------------------------------------------------------
-- 1) Novas colunas em content_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS panel_insert_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS origem_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_items_origem_item_idx ON public.content_items (origem_item_id);

-- ---------------------------------------------------------------------------
-- 2) adicionar_card_workspace — incrementa panel_insert_count do item ao
--    ser inserido em qualquer coluna (mesma assinatura, sem DROP).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adicionar_card_workspace(
  p_column_id                   uuid,
  p_item_id                     uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_id uuid; v_pos int;
  v_owner uuid; v_status public.content_status; v_vis public.content_visibility;
  v_replay jsonb;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_add_items THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.card.add',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT owner_user_id, status, visibility INTO v_owner, v_status, v_vis
    FROM public.content_items WHERE id = p_item_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  -- importação (não-proprietário): exige publicado e visibilidade compatível
  IF v_owner <> v_acc.defensor_user_id THEN
    IF v_status <> 'publicado' THEN RAISE EXCEPTION 'ITEM_NOT_PUBLISHED' USING ERRCODE='22023'; END IF;
    IF v_vis = 'privado' THEN RAISE EXCEPTION 'ITEM_NOT_VISIBLE' USING ERRCODE='42501'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.defensor_workspace_cards
              WHERE column_id = p_column_id AND item_id = p_item_id) THEN
    RAISE EXCEPTION 'ITEM_ALREADY_IN_COLUMN' USING ERRCODE='23505';
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  SELECT COALESCE(max(order_position),-1)+1 INTO v_pos
    FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  VALUES (p_column_id, v_ws, p_item_id, v_pos)
  RETURNING id INTO v_id;

  -- Ajuste doc (AJUSTE 21) — contador cumulativo de inserções em painéis.
  UPDATE public.content_items SET panel_insert_count = panel_insert_count + 1 WHERE id = p_item_id;

  PERFORM private.log_audit_event('workspace.card_added','defensor_workspace_card',
    v_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'column_id', p_column_id, 'item_id', p_item_id),
    NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.card.add',p_idempotency_key,
    jsonb_build_object('card_id', v_id, 'workspace_version', v_new));
  RETURN jsonb_build_object('card_id', v_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.adicionar_card_workspace(uuid,uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_card_workspace(uuid,uuid,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) criar_atendimento — novo parâmetro opcional p_origem_item_id (id do
--    Atendimento usado como referência em "Inspirar novo atendimento").
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_atendimento(text, text, jsonb, uuid[]);

CREATE FUNCTION public.criar_atendimento(
  p_titulo          text,
  p_descricao       text,
  p_form_schema     jsonb,
  p_category_ids    uuid[] DEFAULT NULL,
  p_origem_item_id  uuid DEFAULT NULL
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
  v_schema jsonb;
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

  v_schema := COALESCE(p_form_schema, '[]'::jsonb);
  IF jsonb_typeof(v_schema) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_FORM_SCHEMA' USING ERRCODE='22023';
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
    (kind, category_id, owner_user_id, orgao_id, visibility, status, optimistic_version, origem_item_id)
  VALUES
    ('atendimento', v_cats[1], v_uid, NULL, 'equipe', 'publicado', 1, p_origem_item_id)
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, form_schema, created_by, is_published, published_at)
  VALUES
    (v_item, 1, trim(p_titulo), '{}'::jsonb, trim(COALESCE(p_descricao, '')), v_schema, v_uid, true, now())
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         current_published_version_id = v_ver,
         updated_at = now()
   WHERE id = v_item;

  INSERT INTO public.content_item_categories (item_id, category_id)
  SELECT v_item, cid FROM unnest(v_cats) cid;

  PERFORM private.log_audit_event(
    'atendimento.criado', 'atendimento', v_item::text, 'sucesso', NULL,
    jsonb_build_object('categoria_ids', v_cats, 'origem_item_id', p_origem_item_id), NULL, NULL, NULL
  );

  RETURN jsonb_build_object('item_id', v_item, 'version_id', v_ver);
END;
$fn$;

REVOKE ALL ON FUNCTION public.criar_atendimento(text, text, jsonb, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_atendimento(text, text, jsonb, uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) criar_cota — idem, novo parâmetro opcional p_origem_item_id.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_cota(text, jsonb, text, uuid[], text, text, jsonb);

CREATE FUNCTION public.criar_cota(
  p_titulo            text,
  p_body_json         jsonb,
  p_body_text         text,
  p_category_ids      uuid[] DEFAULT NULL,
  p_orientacao        text DEFAULT NULL,
  p_orientacao_nivel  text DEFAULT 'media',
  p_links             jsonb DEFAULT '[]'::jsonb,
  p_origem_item_id    uuid DEFAULT NULL
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
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
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
    (kind, category_id, owner_user_id, orgao_id, visibility, status, optimistic_version, origem_item_id)
  VALUES
    ('cota', v_cats[1], v_uid, NULL, 'equipe', 'publicado', 1, p_origem_item_id)
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, orientacao, orientacao_nivel, links, created_by, is_published, published_at)
  VALUES
    (v_item, 1, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), trim(p_body_text),
     NULLIF(trim(COALESCE(p_orientacao, '')), ''), v_nivel, COALESCE(p_links, '[]'::jsonb), v_uid, true, now())
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
    jsonb_build_object('categoria_ids', v_cats, 'origem_item_id', p_origem_item_id), NULL, NULL, NULL
  );

  RETURN jsonb_build_object('item_id', v_item, 'version_id', v_ver);
END;
$fn$;

REVOKE ALL ON FUNCTION public.criar_cota(text, jsonb, text, uuid[], text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_cota(text, jsonb, text, uuid[], text, text, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) obter_estatisticas_biblioteca — consulta leve e pontual (mesmo padrão
--    de obter_favorito_biblioteca), para a caixinha flutuante ao passar o
--    mouse no ícone de favoritar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_estatisticas_biblioteca(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_access_count int;
  v_panel_insert_count int;
  v_criados_a_partir_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT access_count, panel_insert_count
    INTO v_access_count, v_panel_insert_count
    FROM public.content_items
   WHERE id = p_item_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT count(*) INTO v_criados_a_partir_count
    FROM public.content_items
   WHERE origem_item_id = p_item_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'access_count', v_access_count,
    'panel_insert_count', v_panel_insert_count,
    'criados_a_partir_count', v_criados_a_partir_count
  );
END $fn$;

REVOKE ALL ON FUNCTION public.obter_estatisticas_biblioteca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_estatisticas_biblioteca(uuid) TO authenticated;
