
-- criar item + versão inicial
CREATE OR REPLACE FUNCTION public.criar_content_item(
  p_kind public.content_kind,
  p_title text,
  p_category_id uuid DEFAULT NULL,
  p_visibility public.content_visibility DEFAULT 'privado'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_item uuid;
  v_ver uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF p_title IS NULL OR length(trim(p_title))=0 THEN
    RAISE EXCEPTION 'Título obrigatório' USING ERRCODE='22023';
  END IF;

  v_org := private.current_operational_org_id();

  INSERT INTO public.content_items (kind, category_id, owner_user_id, orgao_id, visibility, status)
  VALUES (p_kind, p_category_id, v_uid, v_org, p_visibility, 'rascunho')
  RETURNING id INTO v_item;

  INSERT INTO public.content_versions (item_id, version_number, title, body_json, body_text, created_by)
  VALUES (v_item, 1, trim(p_title), '{}'::jsonb, '', v_uid)
  RETURNING id INTO v_ver;

  UPDATE public.content_items SET current_version_id = v_ver, updated_at = now() WHERE id = v_item;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_content_item(public.content_kind, text, uuid, public.content_visibility) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_content_item(public.content_kind, text, uuid, public.content_visibility) TO authenticated;

-- atualizar rascunho: se versão atual está publicada, cria nova versão em rascunho; se em rascunho, sobrescreve? Aqui: sempre cria nova versão para manter histórico
CREATE OR REPLACE FUNCTION public.atualizar_rascunho(
  p_item_id uuid,
  p_title text,
  p_body_json jsonb,
  p_body_text text,
  p_form_schema jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_next int;
  v_ver uuid;
  v_current uuid;
  v_status public.content_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;

  SELECT owner_user_id, current_version_id, status
    INTO v_owner, v_current, v_status
    FROM public.content_items WHERE id = p_item_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Item não encontrado' USING ERRCODE='P0002'; END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Somente o autor pode editar' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.content_versions WHERE item_id = p_item_id;

  INSERT INTO public.content_versions (item_id, version_number, title, body_json, body_text, form_schema, created_by)
  VALUES (p_item_id, v_next, trim(p_title), COALESCE(p_body_json, '{}'::jsonb), COALESCE(p_body_text,''), p_form_schema, v_uid)
  RETURNING id INTO v_ver;

  UPDATE public.content_items
     SET current_version_id = v_ver,
         status = CASE WHEN status = 'arquivado' THEN 'rascunho' ELSE status END,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN v_ver;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_rascunho(uuid, text, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_rascunho(uuid, text, jsonb, text, jsonb) TO authenticated;

-- publicar versão atual
CREATE OR REPLACE FUNCTION public.publicar_versao(
  p_item_id uuid,
  p_visibility public.content_visibility
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_current uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;

  SELECT owner_user_id, current_version_id INTO v_owner, v_current
    FROM public.content_items WHERE id = p_item_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Item não encontrado' USING ERRCODE='P0002'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'Somente o autor pode publicar' USING ERRCODE='42501'; END IF;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Sem versão para publicar' USING ERRCODE='22023'; END IF;

  UPDATE public.content_items
     SET status = 'publicado', visibility = p_visibility, updated_at = now()
   WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publicar_versao(uuid, public.content_visibility) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publicar_versao(uuid, public.content_visibility) TO authenticated;

-- arquivar item
CREATE OR REPLACE FUNCTION public.arquivar_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  SELECT owner_user_id INTO v_owner FROM public.content_items WHERE id = p_item_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'Somente o autor pode arquivar' USING ERRCODE='42501'; END IF;

  UPDATE public.content_items SET status='arquivado', updated_at=now() WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.arquivar_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arquivar_item(uuid) TO authenticated;
