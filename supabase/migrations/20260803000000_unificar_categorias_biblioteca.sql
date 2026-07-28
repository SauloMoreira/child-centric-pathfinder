-- Unificação de categorias da Biblioteca: uma única lista de categorias serve
-- tanto para Cotas quanto para Atendimentos.
--
-- Contexto: content_categories.kind particionava a taxonomia (uma categoria
-- só existia para 'cota' OU para 'atendimento'). Isso obrigava o Admin
-- Técnico a cadastrar a "mesma" categoria duas vezes (uma linha/id por tipo)
-- para que ela aparecesse nos dois fluxos, e fazia o filtro da Biblioteca
-- mostrar nomes duplicados no dropdown (um id por kind). Esta migração:
--
--   1) mescla categorias duplicadas (mesmo nome_normalizado, kinds
--      diferentes) em uma linha canônica, repontando todas as referências;
--   2) remove a coluna kind de content_categories — a lista passa a ser
--      global, com unicidade só por nome_normalizado;
--   3) atualiza as RPCs de escrita/leitura de categoria para o novo formato
--      sem kind;
--   4) corrige listar_biblioteca/obter_item_biblioteca para considerar
--      content_item_categories (N:N) além da coluna legada category_id, de
--      forma que uma cota com múltiplas categorias apareça corretamente ao
--      filtrar a busca da Biblioteca por qualquer uma delas — e passa a
--      devolver a lista completa de categorias de cada item, não só a
--      primeira.

-- ---------------------------------------------------------------------------
-- 1) Mesclar categorias duplicadas (mesmo nome_normalizado)
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  v_dupes int;
BEGIN
  CREATE TEMP TABLE _cat_canon ON COMMIT DROP AS
    SELECT nome_normalizado,
           (array_agg(id ORDER BY created_at, id))[1] AS canonical_id
      FROM public.content_categories
     GROUP BY nome_normalizado;

  CREATE TEMP TABLE _cat_map ON COMMIT DROP AS
    SELECT cc.id AS old_id, cn.canonical_id
      FROM public.content_categories cc
      JOIN _cat_canon cn USING (nome_normalizado)
     WHERE cc.id <> cn.canonical_id;

  SELECT count(*) INTO v_dupes FROM _cat_map;

  IF v_dupes > 0 THEN
    -- Repontar a coluna legada category_id (item -> categoria única).
    UPDATE public.content_items i
       SET category_id = m.canonical_id
      FROM _cat_map m
     WHERE i.category_id = m.old_id;

    -- Repontar a junção N:N, evitando violar a PK composta quando o item já
    -- tinha a canônica associada (ON CONFLICT DO NOTHING), depois apagar as
    -- linhas antigas que ainda apontam pra categoria duplicada.
    INSERT INTO public.content_item_categories (item_id, category_id, created_at)
    SELECT DISTINCT cic.item_id, m.canonical_id, cic.created_at
      FROM public.content_item_categories cic
      JOIN _cat_map m ON m.old_id = cic.category_id
    ON CONFLICT (item_id, category_id) DO NOTHING;

    DELETE FROM public.content_item_categories cic
     USING _cat_map m
    WHERE cic.category_id = m.old_id;

    -- Agora as categorias duplicadas não têm mais nenhuma referência —
    -- podem ser apagadas com segurança (content_item_categories.category_id
    -- é ON DELETE RESTRICT, então isso falharia se ainda houvesse uso).
    DELETE FROM public.content_categories cc
     USING _cat_map m
    WHERE cc.id = m.old_id;

    RAISE NOTICE 'Categorias mescladas: % linha(s) duplicada(s) removida(s).', v_dupes;
  END IF;
END;
$mig$;

-- ---------------------------------------------------------------------------
-- 2) Remover partição por kind — lista de categorias passa a ser global
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_categories
  DROP CONSTRAINT IF EXISTS content_categories_kind_nome_uk;

ALTER TABLE public.content_categories
  ADD CONSTRAINT content_categories_nome_uk UNIQUE (nome_normalizado);

ALTER TABLE public.content_categories
  DROP COLUMN IF EXISTS kind;

COMMENT ON TABLE public.content_categories IS
  'Reintegra: taxonomia institucional única, compartilhada por Cotas e Atendimentos.';

-- Função auxiliar de "Sem categoria" por kind ficou órfã (criar_cota /
-- atualizar_cota não usam fallback silencioso desde o Ajuste 8) e dependia
-- da coluna kind que acabou de ser removida.
DROP FUNCTION IF EXISTS private.get_or_create_categoria_sem_categoria(public.content_kind, uuid);

-- ---------------------------------------------------------------------------
-- 3) Admin Técnico: criar categoria sem kind
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_criar_categoria_biblioteca(public.content_kind, text);

CREATE FUNCTION public.admin_criar_categoria_biblioteca(
  p_nome text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_norm text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.current_user_has_role('admin_tecnico'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023';
  END IF;

  v_norm := private.normalize_text(p_nome);
  IF v_norm = private.normalize_text('Sem categoria') THEN
    RAISE EXCEPTION 'RESERVED_NAME' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.content_categories (nome, nome_normalizado, order_position, created_by)
  VALUES (
    trim(p_nome), v_norm,
    COALESCE((SELECT max(order_position) + 1 FROM public.content_categories), 0),
    v_uid
  )
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event(
    'biblioteca.categoria_criada', 'content_category', v_id::text, 'sucesso', NULL,
    jsonb_build_object('nome', trim(p_nome)), NULL, NULL, NULL
  );

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'CATEGORY_ALREADY_EXISTS' USING ERRCODE='23505';
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_criar_categoria_biblioteca(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_criar_categoria_biblioteca(text) TO authenticated;

-- admin_renomear_categoria_biblioteca não referenciava kind — segue igual.

-- ---------------------------------------------------------------------------
-- 4) listar_categorias_biblioteca — lista única, sem parâmetro de kind
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_categorias_biblioteca(public.content_kind);

CREATE FUNCTION public.listar_categorias_biblioteca()
RETURNS TABLE (
  id uuid,
  nome text,
  cor text,
  order_position int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, nome, cor, order_position
    FROM public.content_categories
   ORDER BY order_position, nome;
$$;

REVOKE ALL ON FUNCTION public.listar_categorias_biblioteca() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_categorias_biblioteca() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) criar_cota / atualizar_cota — categoria só precisa existir, não mais
--    validar kind = 'cota' (a lista de categorias agora é única)
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

-- ---------------------------------------------------------------------------
-- 6) listar_biblioteca / obter_item_biblioteca — filtro e exibição
--    consideram content_item_categories (N:N), não só a coluna legada
--    category_id (que só guarda a primeira categoria de uma cota).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int);

CREATE FUNCTION public.listar_biblioteca(
  p_kind public.content_kind DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_apenas_meus boolean DEFAULT false,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  kind public.content_kind,
  titulo text,
  categoria_id uuid,
  categoria_nome text,
  categorias jsonb,
  visibility public.content_visibility,
  status public.content_status,
  owner_user_id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_q text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_q := NULLIF(trim(COALESCE(p_query, '')), '');

  RETURN QUERY
    SELECT i.id, i.kind, COALESCE(v.title, '(sem título)'),
           cat.id, cat.nome,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.nome)
                FROM public.content_item_categories cic
                JOIN public.content_categories cc ON cc.id = cic.category_id
               WHERE cic.item_id = i.id),
             CASE WHEN cat.id IS NOT NULL
                  THEN jsonb_build_array(jsonb_build_object('id', cat.id, 'nome', cat.nome))
                  ELSE '[]'::jsonb
             END
           ),
           i.visibility, i.status, i.owner_user_id, i.updated_at
      FROM public.content_items i
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
     WHERE
       i.deleted_at IS NULL
       AND (p_kind IS NULL OR i.kind = p_kind)
       AND (
         p_category_id IS NULL
         OR i.category_id = p_category_id
         OR EXISTS (
              SELECT 1 FROM public.content_item_categories cic
               WHERE cic.item_id = i.id AND cic.category_id = p_category_id
            )
       )
       AND (NOT p_apenas_meus OR i.owner_user_id = v_uid)
       AND (
         v_q IS NULL
         OR v.title ILIKE '%' || v_q || '%'
         OR v.body_text ILIKE '%' || v_q || '%'
       )
     ORDER BY i.updated_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
     OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int) TO authenticated;

DROP FUNCTION IF EXISTS public.obter_item_biblioteca(uuid);

CREATE FUNCTION public.obter_item_biblioteca(p_item_id uuid)
RETURNS TABLE(
  id uuid,
  kind public.content_kind,
  status public.content_status,
  visibility public.content_visibility,
  categoria_id uuid,
  categoria_nome text,
  categorias jsonb,
  owner_user_id uuid,
  current_version_id uuid,
  current_published_version_id uuid,
  optimistic_version bigint,
  titulo text,
  body_json jsonb,
  form_schema jsonb,
  version_number integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT i.id, i.kind, i.status, i.visibility, cat.id, cat.nome,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.nome)
                FROM public.content_item_categories cic
                JOIN public.content_categories cc ON cc.id = cic.category_id
               WHERE cic.item_id = i.id),
             CASE WHEN cat.id IS NOT NULL
                  THEN jsonb_build_array(jsonb_build_object('id', cat.id, 'nome', cat.nome))
                  ELSE '[]'::jsonb
             END
           ),
           i.owner_user_id, i.current_version_id, i.current_published_version_id,
           i.optimistic_version,
           v.title, v.body_json, v.form_schema, v.version_number, i.updated_at
      FROM public.content_items i
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
     WHERE i.id = p_item_id
       AND i.deleted_at IS NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.obter_item_biblioteca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_item_biblioteca(uuid) TO authenticated;
