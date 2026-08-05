-- Doc bloco novo — reformulação da página Biblioteca (parte 2/N — banco de
-- dados): a nova tabela ordenável da Biblioteca precisa, por linha e sem
-- N+1 consultas, dos números de "inserções em painel" e "criados a partir
-- deste(a)" (que já existiam só na consulta pontual
-- obter_estatisticas_biblioteca, usada na caixinha flutuante). Também troca
-- o filtro de categoria única (p_category_id) por múltiplas categorias
-- simultâneas (p_category_ids), pedido explícito do doc para a Biblioteca.

DROP FUNCTION IF EXISTS public.listar_biblioteca(
  public.content_kind, uuid, text, boolean, uuid, boolean, text, int, int
);

CREATE FUNCTION public.listar_biblioteca(
  p_kind             public.content_kind DEFAULT NULL,
  p_category_ids     uuid[] DEFAULT NULL,
  p_query            text DEFAULT NULL,
  p_apenas_meus      boolean DEFAULT false,
  p_owner_user_id    uuid DEFAULT NULL,
  p_favoritos_apenas boolean DEFAULT false,
  p_order_by         text DEFAULT 'recentes',
  p_limit            int DEFAULT 50,
  p_offset           int DEFAULT 0
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
  owner_nome text,
  updated_at timestamptz,
  favorite_count bigint,
  is_favorited boolean,
  access_count integer,
  panel_insert_count integer,
  criados_a_partir_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_q text; v_order text; v_cats uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_q := NULLIF(trim(COALESCE(p_query, '')), '');
  v_order := COALESCE(NULLIF(trim(p_order_by), ''), 'recentes');
  v_cats := NULLIF(p_category_ids, ARRAY[]::uuid[]);

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
           i.visibility, i.status, i.owner_user_id, COALESCE(p.nome_completo, 'Sem nome'), i.updated_at,
           COALESCE(fc.cnt, 0),
           EXISTS (SELECT 1 FROM public.content_favorites f WHERE f.item_id = i.id AND f.user_id = v_uid),
           i.access_count,
           i.panel_insert_count,
           COALESCE(cap.cnt, 0)
      FROM public.content_items i
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.profiles p ON p.user_id = i.owner_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS cnt FROM public.content_favorites f WHERE f.item_id = i.id
      ) fc ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS cnt FROM public.content_items ci2
         WHERE ci2.origem_item_id = i.id AND ci2.deleted_at IS NULL
      ) cap ON true
     WHERE
       i.deleted_at IS NULL
       AND (p_kind IS NULL OR i.kind = p_kind)
       AND (
         v_cats IS NULL
         OR i.category_id = ANY(v_cats)
         OR EXISTS (
              SELECT 1 FROM public.content_item_categories cic
               WHERE cic.item_id = i.id AND cic.category_id = ANY(v_cats)
            )
       )
       AND (NOT p_apenas_meus OR i.owner_user_id = v_uid)
       AND (p_owner_user_id IS NULL OR i.owner_user_id = p_owner_user_id)
       AND (
         NOT p_favoritos_apenas
         OR EXISTS (SELECT 1 FROM public.content_favorites f WHERE f.item_id = i.id AND f.user_id = v_uid)
       )
       AND (
         v_q IS NULL
         OR v.title ILIKE '%' || v_q || '%'
         OR v.body_text ILIKE '%' || v_q || '%'
       )
     ORDER BY
       CASE WHEN v_order = 'favoritos'  THEN COALESCE(fc.cnt, 0) END DESC NULLS LAST,
       CASE WHEN v_order = 'utilizados' THEN i.access_count END DESC NULLS LAST,
       i.updated_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
     OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_biblioteca(
  public.content_kind, uuid[], text, boolean, uuid, boolean, text, int, int
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_biblioteca(
  public.content_kind, uuid[], text, boolean, uuid, boolean, text, int, int
) TO authenticated;
