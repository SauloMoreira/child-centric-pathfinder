-- Cota · Passo 2/2 — categorias múltiplas, categorias de Admin Técnico,
-- visibilidade de equipe do Defensor, e RPCs de Cota (criar/editar/excluir/detalhe).
--
-- Contexto: "Cota" é um modelo de texto reutilizável (negrito/itálico/sublinhado)
-- criado por um Defensor Público, categorizado por matéria/tema (múltiplas
-- categorias por cota), usado por sua equipe (vínculo ativo em
-- member_defensor_bonds). Apenas o Defensor autor pode editar/excluir.
--
-- Reaproveita a infraestrutura de content_items/content_categories/content_versions
-- (Gate 2 · 0025). Não altera o fluxo de Atendimento (rascunho/publicar/arquivar).

-- ---------------------------------------------------------------------------
-- 0) content_items.deleted_at — exclusão de cota é "permanente" do ponto de
--    vista do usuário, mas content_versions é append-only por trigger
--    (content_versions_no_delete/no_update, Gate 2 · 0025): nunca é possível
--    apagar linhas de versão. excluir_cota() marca o item como excluído
--    (esconde de toda leitura) preservando o rastro de auditoria.
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1) content_item_categories — categorização N:N (cota pode ter várias)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_item_categories (
  item_id     uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.content_categories(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, category_id)
);

ALTER TABLE public.content_item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_item_categories_select_via_item
  ON public.content_item_categories
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_items i WHERE i.id = content_item_categories.item_id));

REVOKE ALL ON public.content_item_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_item_categories TO authenticated;
GRANT ALL ON public.content_item_categories TO service_role;

-- Backfill: itens que já tinham categoria única (category_id) passam a ter
-- também a entrada correspondente na tabela de junção.
INSERT INTO public.content_item_categories (item_id, category_id)
SELECT id, category_id FROM public.content_items WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Categoria padrão "Sem categoria" (auto-criada por kind, sob demanda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_or_create_categoria_sem_categoria(
  p_kind  public.content_kind,
  p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.content_categories
   WHERE kind = p_kind AND nome_normalizado = private.normalize_text('Sem categoria');

  IF v_id IS NULL THEN
    INSERT INTO public.content_categories (nome, nome_normalizado, kind, cor, order_position, created_by)
    VALUES ('Sem categoria', private.normalize_text('Sem categoria'), p_kind, NULL, -1, p_actor)
    ON CONFLICT (kind, nome_normalizado) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.get_or_create_categoria_sem_categoria(public.content_kind, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Admin Técnico: criar/renomear categorias da biblioteca
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_criar_categoria_biblioteca(
  p_kind public.content_kind,
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

  INSERT INTO public.content_categories (nome, nome_normalizado, kind, order_position, created_by)
  VALUES (
    trim(p_nome), v_norm, p_kind,
    COALESCE((SELECT max(order_position) + 1 FROM public.content_categories WHERE kind = p_kind), 0),
    v_uid
  )
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event(
    'biblioteca.categoria_criada', 'content_category', v_id::text, 'sucesso', NULL,
    jsonb_build_object('kind', p_kind, 'nome', trim(p_nome)), NULL, NULL, NULL
  );

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'CATEGORY_ALREADY_EXISTS' USING ERRCODE='23505';
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_criar_categoria_biblioteca(public.content_kind, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_criar_categoria_biblioteca(public.content_kind, text) TO authenticated;

CREATE FUNCTION public.admin_renomear_categoria_biblioteca(
  p_category_id uuid,
  p_nome        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_norm text;
  v_old_norm text;
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

  SELECT nome_normalizado INTO v_old_norm FROM public.content_categories WHERE id = p_category_id;
  IF v_old_norm IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_old_norm = private.normalize_text('Sem categoria') THEN
    RAISE EXCEPTION 'RESERVED_CATEGORY' USING ERRCODE='22023';
  END IF;

  v_norm := private.normalize_text(p_nome);

  UPDATE public.content_categories
     SET nome = trim(p_nome), nome_normalizado = v_norm, updated_at = now()
   WHERE id = p_category_id;

  PERFORM private.log_audit_event(
    'biblioteca.categoria_renomeada', 'content_category', p_category_id::text, 'sucesso', NULL,
    jsonb_build_object('nome', trim(p_nome)), NULL, NULL, NULL
  );
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'CATEGORY_ALREADY_EXISTS' USING ERRCODE='23505';
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_renomear_categoria_biblioteca(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_renomear_categoria_biblioteca(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) RLS: cota visível para a equipe vinculada ao Defensor autor
-- ---------------------------------------------------------------------------
CREATE POLICY content_items_select_cota_equipe
  ON public.content_items
  FOR SELECT TO authenticated
  USING (
    kind = 'cota'
    AND status = 'publicado'
    AND visibility = 'equipe'
    AND deleted_at IS NULL
    AND private.user_can_act_for_defensor(auth.uid(), owner_user_id, NULL)
  );

-- ---------------------------------------------------------------------------
-- 5) criar_cota — Defensor autor, autoria implícita, sem rascunho/publicação
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.criar_cota(
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

  v_cats := COALESCE((SELECT array_agg(DISTINCT c) FROM unnest(p_category_ids) AS c), ARRAY[]::uuid[]);

  IF array_length(v_cats, 1) IS NULL THEN
    v_cats := ARRAY[ private.get_or_create_categoria_sem_categoria('cota'::public.content_kind, v_uid) ];
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
    (v_item, 1, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), COALESCE(p_body_text, ''), v_uid, true, now())
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
-- 6) atualizar_cota — apenas o autor, sempre cria nova versão imutável
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.atualizar_cota(
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

  v_replay := private.claim_idempotency(v_uid, 'cota.update', p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_cats := COALESCE((SELECT array_agg(DISTINCT c) FROM unnest(p_category_ids) AS c), ARRAY[]::uuid[]);
  IF array_length(v_cats, 1) IS NULL THEN
    v_cats := ARRAY[ private.get_or_create_categoria_sem_categoria('cota'::public.content_kind, v_uid) ];
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
    (p_item_id, v_next_ver_num, trim(p_titulo), COALESCE(p_body_json, '{}'::jsonb), COALESCE(p_body_text, ''), v_uid, true, now())
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
-- 7) excluir_cota — exclusão permanente do ponto de vista do usuário
--    (some de toda listagem/detalhe/quadro), apenas o autor.
--
--    content_versions é append-only (trigger content_versions_no_delete /
--    no_update, Gate 2 · 0025): nunca é fisicamente apagada. excluir_cota()
--    marca content_items.deleted_at e remove os cards do(s) quadro(s) —
--    o rastro de auditoria permanece intacto, mas nada volta a ficar visível.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.excluir_cota(
  p_item_id          uuid,
  p_expected_version bigint,
  p_idempotency_key  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid         uuid := auth.uid();
  v_owner       uuid;
  v_kind        public.content_kind;
  v_cur_version bigint;
  v_replay      jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  SELECT owner_user_id, kind, optimistic_version INTO v_owner, v_kind, v_cur_version
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
  IF v_cur_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  v_replay := private.claim_idempotency(v_uid, 'cota.delete', p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  DELETE FROM public.defensor_workspace_cards WHERE item_id = p_item_id;

  UPDATE public.content_items
     SET deleted_at = now(),
         optimistic_version = optimistic_version + 1,
         updated_at = now()
   WHERE id = p_item_id;

  PERFORM private.log_audit_event(
    'cota.excluida', 'cota', p_item_id::text, 'sucesso', NULL, NULL, NULL, NULL, NULL
  );

  PERFORM private.complete_idempotency(v_uid, 'cota.delete', p_idempotency_key,
    jsonb_build_object('deleted', true));

  RETURN jsonb_build_object('deleted', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.excluir_cota(uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_cota(uuid, bigint, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) obter_cota_detalhe — camada lateral expandida (autorização explícita,
--    não depende só de RLS, pois a função roda como SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.obter_cota_detalhe(p_item_id uuid)
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

-- ---------------------------------------------------------------------------
-- 9) listar_workspace_completo — categoryNames como array real (múltiplas
--    categorias) + bodyText do card (copiar sem abrir), somente para cota.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.listar_workspace_completo(uuid);

CREATE FUNCTION public.listar_workspace_completo(p_panel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_ws record;
  v_acc record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_panel_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_ws
    FROM public.defensor_workspaces
   WHERE id = p_panel_id
     AND archived_at IS NULL;

  IF v_ws.id IS NULL THEN
    RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws.id);
  IF NOT v_acc.can_view THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'descricao', c.descricao,
      'corToken', c.cor_token,
      'corCustom', c.cor,
      'orderPosition', c.order_position
    ) ORDER BY c.order_position), '[]'::jsonb)
    INTO v_columns
    FROM public.defensor_workspace_columns c
   WHERE c.workspace_id = v_ws.id;

  WITH raw AS (
    SELECT k.id, k.column_id, k.item_id, k.order_position, k.updated_at,
           i.kind, i.owner_user_id, i.status,
           v.title, v.version_number, v.body_text,
           pv.title AS pub_title, pv.version_number AS pub_version,
           pr.nome_completo AS owner_name,
           COALESCE((
             SELECT jsonb_agg(cc.nome ORDER BY cc.order_position)
               FROM public.content_item_categories cic
               JOIN public.content_categories cc ON cc.id = cic.category_id
              WHERE cic.item_id = i.id
           ), '[]'::jsonb) AS categorias
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id AND i.deleted_at IS NULL
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_versions pv ON pv.id = i.current_published_version_id
      LEFT JOIN public.profiles pr ON pr.user_id = i.owner_user_id
     WHERE k.workspace_id = v_ws.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cardId',       r.id,
    'workspaceId',  v_ws.id,
    'columnId',     r.column_id,
    'itemId',       r.item_id,
    'kind',         r.kind,
    'placement',    CASE WHEN r.owner_user_id = v_acc.defensor_user_id THEN 'owned' ELSE 'imported' END,
    'title',        COALESCE(r.pub_title, r.title, '(sem título)'),
    'description',  NULL,
    'categoryNames', r.categorias,
    'ownerDisplayName', COALESCE(r.owner_name, ''),
    'status',       r.status,
    'publishedVersionNumber', r.pub_version,
    'updatedAt',    r.updated_at,
    'archivedByAuthor', (r.status = 'arquivado'),
    'orderPosition', r.order_position,
    'bodyText', CASE WHEN r.kind = 'cota' THEN r.body_text ELSE NULL END,
    'canOpen', (
      (v_acc.access_mode = 'owner')
      OR (r.status = 'publicado')
      OR (r.status = 'arquivado' AND r.pub_version IS NOT NULL)
    ),
    'canEdit', (r.owner_user_id = v_actor),
    'canUse',  (
      (r.status = 'publicado')
      OR (v_acc.access_mode = 'owner' AND r.status <> 'arquivado')
    )
  ) ORDER BY r.order_position), '[]'::jsonb) INTO v_cards FROM raw r;

  RETURN jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id,
      'defensorUserId', v_ws.defensor_user_id,
      'nome', v_ws.nome,
      'icone', v_ws.icone,
      'optimisticVersion', v_ws.optimistic_version,
      'updatedAt', v_ws.updated_at
    ),
    'access', jsonb_build_object(
      'accessMode', v_acc.access_mode,
      'canEditWorkspace', v_acc.can_edit_workspace,
      'canManageColumns', v_acc.can_manage_columns,
      'canMoveCards', v_acc.can_move_cards,
      'canAddItems', v_acc.can_add_items
    ),
    'columns', v_columns,
    'cards', v_cards
  );
END $function$;

REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) Esconder cotas excluídas (deleted_at) da biblioteca genérica e da
--     policy de dono — não altera nada do fluxo de Atendimento além disso.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_biblioteca(
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
           cat.id, cat.nome, i.visibility, i.status, i.owner_user_id, i.updated_at
      FROM public.content_items i
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
     WHERE
       i.deleted_at IS NULL
       AND (p_kind IS NULL OR i.kind = p_kind)
       AND (p_category_id IS NULL OR i.category_id = p_category_id)
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

CREATE OR REPLACE FUNCTION public.obter_item_biblioteca(p_item_id uuid)
RETURNS TABLE(
  id uuid,
  kind public.content_kind,
  status public.content_status,
  visibility public.content_visibility,
  categoria_id uuid,
  categoria_nome text,
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
           i.owner_user_id, i.current_version_id, i.current_published_version_id,
           i.optimistic_version,
           v.title, v.body_json, v.form_schema, v.version_number, i.updated_at
      FROM public.content_items i
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
     WHERE i.id = p_item_id
       AND i.deleted_at IS NULL;
END $fn$;

DROP POLICY IF EXISTS content_items_select_owner ON public.content_items;
CREATE POLICY content_items_select_owner
  ON public.content_items
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() AND deleted_at IS NULL);
