
-- =====================================================================
-- Gate 2 · Bloco 5 — RPCs de leitura (Área de Trabalho + Biblioteca)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quadros do defensor no órgão
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_workspaces_defensor(
  p_defensor_user_id uuid,
  p_orgao_id uuid
)
RETURNS TABLE (
  id uuid,
  nome text,
  icone text,
  order_position int,
  total_colunas bigint,
  total_cards bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.user_can_act_for_defensor(auth.uid(), p_defensor_user_id, p_orgao_id) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT w.id, w.nome, w.icone, w.order_position,
           (SELECT count(*) FROM public.defensor_workspace_columns c WHERE c.workspace_id = w.id),
           (SELECT count(*) FROM public.defensor_workspace_cards k
              JOIN public.defensor_workspace_columns c ON c.id = k.column_id
             WHERE c.workspace_id = w.id),
           w.updated_at
      FROM public.defensor_workspaces w
     WHERE w.defensor_user_id = p_defensor_user_id
       AND w.orgao_id = p_orgao_id
     ORDER BY w.order_position, w.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_workspaces_defensor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_workspaces_defensor(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Colunas de um quadro
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_colunas_workspace(
  p_workspace_id uuid
)
RETURNS TABLE (
  id uuid,
  nome text,
  cor text,
  order_position int,
  total_cards bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_def uuid; v_org uuid;
BEGIN
  SELECT defensor_user_id, orgao_id INTO v_def, v_org
    FROM public.defensor_workspaces WHERE id = p_workspace_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Quadro não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.user_can_act_for_defensor(auth.uid(), v_def, v_org) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.id, c.nome, c.cor, c.order_position,
           (SELECT count(*) FROM public.defensor_workspace_cards k WHERE k.column_id = c.id)
      FROM public.defensor_workspace_columns c
     WHERE c.workspace_id = p_workspace_id
     ORDER BY c.order_position, c.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_colunas_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_colunas_workspace(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Cartões de uma coluna (join com item + versão atual)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_cards_coluna(
  p_column_id uuid
)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  kind public.content_kind,
  titulo text,
  categoria text,
  status public.content_status,
  note text,
  order_position int,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_def uuid; v_org uuid;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_columns c
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Coluna não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.user_can_act_for_defensor(auth.uid(), v_def, v_org) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT k.id,
           i.id,
           i.kind,
           COALESCE(v.title, '(sem título)'),
           cat.nome,
           i.status,
           k.note,
           k.order_position,
           k.updated_at
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
     WHERE k.column_id = p_column_id
     ORDER BY k.order_position, k.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_cards_coluna(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_cards_coluna(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Biblioteca — listagem com filtros
-- ---------------------------------------------------------------------
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
       -- delega visibilidade à RLS (SELECT policies já filtram)
       (p_kind IS NULL OR i.kind = p_kind)
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

REVOKE ALL ON FUNCTION public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int) TO authenticated;

-- ---------------------------------------------------------------------
-- Biblioteca — categorias por tipo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_categorias_biblioteca(
  p_kind public.content_kind DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  kind public.content_kind,
  cor text,
  order_position int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, nome, kind, cor, order_position
    FROM public.content_categories
   WHERE p_kind IS NULL OR kind = p_kind
   ORDER BY order_position, nome;
$$;

REVOKE ALL ON FUNCTION public.listar_categorias_biblioteca(public.content_kind) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_categorias_biblioteca(public.content_kind) TO authenticated;

-- ---------------------------------------------------------------------
-- Item da Biblioteca com versão atual
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_item_biblioteca(
  p_item_id uuid
)
RETURNS TABLE (
  id uuid,
  kind public.content_kind,
  status public.content_status,
  visibility public.content_visibility,
  categoria_id uuid,
  categoria_nome text,
  owner_user_id uuid,
  current_version_id uuid,
  titulo text,
  body_json jsonb,
  form_schema jsonb,
  version_number int,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT i.id, i.kind, i.status, i.visibility, cat.id, cat.nome,
           i.owner_user_id, i.current_version_id,
           v.title, v.body_json, v.form_schema, v.version_number, i.updated_at
      FROM public.content_items i
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
     WHERE i.id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.obter_item_biblioteca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_item_biblioteca(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Versões de um item (histórico)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_versoes_item(
  p_item_id uuid
)
RETURNS TABLE (
  id uuid,
  version_number int,
  titulo text,
  created_by uuid,
  created_at timestamptz,
  is_current boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_current uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT current_version_id INTO v_current
    FROM public.content_items WHERE id = p_item_id;

  RETURN QUERY
    SELECT v.id, v.version_number, v.title, v.created_by, v.created_at,
           (v.id = v_current)
      FROM public.content_versions v
     WHERE v.item_id = p_item_id
     ORDER BY v.version_number DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_versoes_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_versoes_item(uuid) TO authenticated;
