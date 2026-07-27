-- =====================================================================
-- Sub-gate 4.1.b · Turno 1 — content_version_integrity
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Grants mínimos nas tabelas públicas de conteúdo
--    (RLS permanece habilitada; mutações passam a exigir RPC protegida)
-- ---------------------------------------------------------------------
REVOKE ALL ON public.content_items    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.content_versions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.content_items    TO authenticated;
GRANT SELECT ON public.content_versions TO authenticated;

GRANT ALL ON public.content_items    TO service_role;
GRANT ALL ON public.content_versions TO service_role;

-- ---------------------------------------------------------------------
-- 2) FK item_id: CASCADE -> RESTRICT (proteção contra purge acidental)
-- ---------------------------------------------------------------------
ALTER TABLE public.content_versions
  DROP CONSTRAINT content_versions_item_id_fkey;

ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.content_items(id)
  ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 3) Novos campos técnicos
-- ---------------------------------------------------------------------
ALTER TABLE public.content_versions
  ADD COLUMN IF NOT EXISTS is_published boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS optimistic_version bigint  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_published_version_id uuid;

ALTER TABLE public.content_items
  DROP CONSTRAINT IF EXISTS content_items_current_pub_version_fk;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_current_pub_version_fk
  FOREIGN KEY (current_published_version_id)
  REFERENCES public.content_versions(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Integridade histórica: se is_published, then published_at deve existir
ALTER TABLE public.content_versions
  DROP CONSTRAINT IF EXISTS content_versions_publish_consistency;
ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_publish_consistency
  CHECK ((is_published = false AND published_at IS NULL)
      OR (is_published = true  AND published_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS ix_content_versions_item_pub
  ON public.content_versions (item_id, is_published, version_number DESC);

-- ---------------------------------------------------------------------
-- 4) Trigger que impede ponteiro para versão de outro item
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_content_items_pointer_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_item uuid;
  v_pub  boolean;
BEGIN
  IF NEW.current_version_id IS NOT NULL THEN
    SELECT item_id INTO v_item
      FROM public.content_versions WHERE id = NEW.current_version_id;
    IF v_item IS NULL THEN
      RAISE EXCEPTION 'CONTENT_VERSION_NOT_FOUND' USING ERRCODE='P0002';
    END IF;
    IF v_item <> NEW.id THEN
      RAISE EXCEPTION 'CONTENT_VERSION_ITEM_MISMATCH' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.current_published_version_id IS NOT NULL THEN
    SELECT item_id, is_published INTO v_item, v_pub
      FROM public.content_versions WHERE id = NEW.current_published_version_id;
    IF v_item IS NULL THEN
      RAISE EXCEPTION 'CONTENT_VERSION_NOT_FOUND' USING ERRCODE='P0002';
    END IF;
    IF v_item <> NEW.id THEN
      RAISE EXCEPTION 'CONTENT_VERSION_ITEM_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF v_pub IS NOT TRUE THEN
      RAISE EXCEPTION 'CONTENT_VERSION_NOT_PUBLISHABLE' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS content_items_pointer_integrity ON public.content_items;
CREATE TRIGGER content_items_pointer_integrity
  BEFORE INSERT OR UPDATE OF current_version_id, current_published_version_id
  ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_items_pointer_integrity();

-- ---------------------------------------------------------------------
-- 5) RPCs reescritas
-- ---------------------------------------------------------------------

-- 5.a criar_content_item — cria item + versão 1 (rascunho)
CREATE OR REPLACE FUNCTION public.criar_content_item(
  p_kind        public.content_kind,
  p_title       text,
  p_category_id uuid DEFAULT NULL,
  p_visibility  public.content_visibility DEFAULT 'privado'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_item uuid;
  v_ver  uuid;
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
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023';
  END IF;

  v_org := private.current_operational_org_id();

  INSERT INTO public.content_items
    (kind, category_id, owner_user_id, orgao_id, visibility, status, optimistic_version)
  VALUES
    (p_kind, p_category_id, v_uid, v_org, p_visibility, 'rascunho', 1)
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, created_by, is_published, published_at)
  VALUES
    (v_item, 1, trim(p_title), '{}'::jsonb, '', v_uid, false, NULL)
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         updated_at = now()
   WHERE id = v_item;

  PERFORM private.log_audit_event(
    'content.item_created', 'content_item', v_item::text,
    'sucesso', NULL,
    jsonb_build_object('kind', p_kind, 'version_number', 1),
    v_org, NULL, NULL
  );

  RETURN v_item;
END $fn$;

-- 5.b atualizar_rascunho — nova versão imutável, concorrente e idempotente
DROP FUNCTION IF EXISTS public.atualizar_rascunho(uuid, text, jsonb, text, jsonb);

CREATE OR REPLACE FUNCTION public.atualizar_rascunho(
  p_item_id          uuid,
  p_expected_version bigint,
  p_idempotency_key  uuid,
  p_title            text,
  p_body_json        jsonb,
  p_body_text        text,
  p_form_schema      jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status public.content_status;
  v_optv   bigint;
  v_next   int;
  v_ver    uuid;
  v_claim  jsonb;
  v_result jsonb;
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

  v_claim := private.claim_idempotency(v_uid, 'content.save_draft', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  -- Bloqueia o item
  SELECT owner_user_id, status, optimistic_version
    INTO v_owner, v_status, v_optv
    FROM public.content_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE='42501';
  END IF;
  IF v_status = 'arquivado' THEN
    RAISE EXCEPTION 'CONTENT_ARCHIVED' USING ERRCODE='22023';
  END IF;
  IF v_optv <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.content_versions
   WHERE item_id = p_item_id;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, form_schema, created_by, is_published, published_at)
  VALUES
    (p_item_id, v_next, trim(coalesce(p_title,'')),
     coalesce(p_body_json, '{}'::jsonb),
     coalesce(p_body_text, ''),
     p_form_schema, v_uid, false, NULL)
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         optimistic_version = optimistic_version + 1,
         updated_at = now()
   WHERE id = p_item_id;

  v_result := jsonb_build_object(
    'version_id', v_ver,
    'version_number', v_next,
    'optimistic_version', v_optv + 1
  );

  PERFORM private.log_audit_event(
    'content.version_created', 'content_version', v_ver::text,
    'sucesso', NULL,
    jsonb_build_object('item_id', p_item_id, 'version_number', v_next),
    NULL, NULL, NULL
  );

  PERFORM private.complete_idempotency(v_uid, 'content.save_draft', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

-- 5.c publicar_versao — cria nova versão publicada (append-only)
DROP FUNCTION IF EXISTS public.publicar_versao(uuid, public.content_visibility);

CREATE OR REPLACE FUNCTION public.publicar_versao(
  p_item_id          uuid,
  p_expected_version bigint,
  p_idempotency_key  uuid,
  p_visibility       public.content_visibility
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_status    public.content_status;
  v_optv      bigint;
  v_current   uuid;
  v_src_title text;
  v_src_body  jsonb;
  v_src_txt   text;
  v_src_form  jsonb;
  v_src_item  uuid;
  v_next      int;
  v_new_ver   uuid;
  v_claim     jsonb;
  v_result    jsonb;
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

  v_claim := private.claim_idempotency(v_uid, 'content.publish', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  SELECT owner_user_id, status, optimistic_version, current_version_id
    INTO v_owner, v_status, v_optv, v_current
    FROM public.content_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE='42501';
  END IF;
  IF v_status = 'arquivado' THEN
    RAISE EXCEPTION 'CONTENT_ARCHIVED' USING ERRCODE='22023';
  END IF;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'CONTENT_VERSION_NOT_PUBLISHABLE' USING ERRCODE='22023';
  END IF;
  IF v_optv <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  SELECT item_id, title, body_json, body_text, form_schema
    INTO v_src_item, v_src_title, v_src_body, v_src_txt, v_src_form
    FROM public.content_versions WHERE id = v_current;

  IF v_src_item IS NULL OR v_src_item <> p_item_id THEN
    RAISE EXCEPTION 'CONTENT_VERSION_ITEM_MISMATCH' USING ERRCODE='23514';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.content_versions WHERE item_id = p_item_id;

  INSERT INTO public.content_versions
    (item_id, version_number, title, body_json, body_text, form_schema, created_by, is_published, published_at)
  VALUES
    (p_item_id, v_next, v_src_title, v_src_body, v_src_txt, v_src_form, v_uid, true, now())
  RETURNING id INTO v_new_ver;

  UPDATE public.content_items
     SET status = 'publicado',
         visibility = p_visibility,
         current_version_id = v_new_ver,
         current_published_version_id = v_new_ver,
         optimistic_version = optimistic_version + 1,
         updated_at = now()
   WHERE id = p_item_id;

  v_result := jsonb_build_object(
    'version_id', v_new_ver,
    'version_number', v_next,
    'optimistic_version', v_optv + 1
  );

  PERFORM private.log_audit_event(
    'content.published', 'content_version', v_new_ver::text,
    'sucesso', NULL,
    jsonb_build_object('item_id', p_item_id, 'version_number', v_next, 'visibility', p_visibility),
    NULL, NULL, NULL
  );

  PERFORM private.complete_idempotency(v_uid, 'content.publish', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

-- 5.d arquivar_item — preserva versões
DROP FUNCTION IF EXISTS public.arquivar_item(uuid);

CREATE OR REPLACE FUNCTION public.arquivar_item(
  p_item_id          uuid,
  p_expected_version bigint,
  p_idempotency_key  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status public.content_status;
  v_optv   bigint;
  v_claim  jsonb;
  v_result jsonb;
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

  v_claim := private.claim_idempotency(v_uid, 'content.archive', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  SELECT owner_user_id, status, optimistic_version
    INTO v_owner, v_status, v_optv
    FROM public.content_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE='42501';
  END IF;
  IF v_optv <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  IF v_status <> 'arquivado' THEN
    UPDATE public.content_items
       SET status = 'arquivado',
           optimistic_version = optimistic_version + 1,
           updated_at = now()
     WHERE id = p_item_id;
  END IF;

  v_result := jsonb_build_object(
    'item_id', p_item_id,
    'optimistic_version', v_optv + CASE WHEN v_status <> 'arquivado' THEN 1 ELSE 0 END
  );

  PERFORM private.log_audit_event(
    'content.archived', 'content_item', p_item_id::text,
    'sucesso', NULL,
    jsonb_build_object('previous_status', v_status),
    NULL, NULL, NULL
  );

  PERFORM private.complete_idempotency(v_uid, 'content.archive', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

-- 5.e obter_item_biblioteca — expõe optimistic_version
DROP FUNCTION IF EXISTS public.obter_item_biblioteca(uuid);

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
     WHERE i.id = p_item_id;
END $fn$;

-- ---------------------------------------------------------------------
-- 6) Grants de execução das RPCs (SECURITY DEFINER)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.criar_content_item(public.content_kind, text, uuid, public.content_visibility) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_rascunho(uuid, bigint, uuid, text, jsonb, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publicar_versao(uuid, bigint, uuid, public.content_visibility) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquivar_item(uuid, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obter_item_biblioteca(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.criar_content_item(public.content_kind, text, uuid, public.content_visibility) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_rascunho(uuid, bigint, uuid, text, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_versao(uuid, bigint, uuid, public.content_visibility) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_item(uuid, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_item_biblioteca(uuid) TO authenticated;

COMMIT;