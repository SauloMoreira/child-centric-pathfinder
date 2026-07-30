-- Reformulação da página Biblioteca (parte 1/N — banco de dados):
-- favoritos, contador de utilização (para o ranking "Mais utilizados") e
-- listar_biblioteca estendida com os novos filtros do doc: autoria
-- (Todos/Somente meus/usuário específico), ranking (Recentes/Mais
-- favoritados/Mais utilizados) e "só meus favoritos".

-- ---------------------------------------------------------------------------
-- 1) Contador de utilização (denormalizado, incrementado a cada abertura)
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registrar_acesso_biblioteca(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.content_items
     SET access_count = access_count + 1
   WHERE id = p_item_id AND deleted_at IS NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.registrar_acesso_biblioteca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_biblioteca(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Favoritos — qualquer usuário autenticado pode favoritar qualquer
--    Atendimento/Cota que consiga visualizar, seja de sua autoria ou não.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_favorites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_favorites_user_item_key UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS content_favorites_item_idx ON public.content_favorites (item_id);
CREATE INDEX IF NOT EXISTS content_favorites_user_idx ON public.content_favorites (user_id);

ALTER TABLE public.content_favorites ENABLE ROW LEVEL SECURITY;
-- Sem policies diretas — toda leitura/escrita passa pelas RPCs abaixo
-- (SECURITY DEFINER), mesmo padrão já usado para outras tabelas do sistema.
REVOKE ALL ON public.content_favorites FROM PUBLIC, anon, authenticated;

-- Alterna favorito/desfavorito do item para o usuário logado, retornando o
-- novo estado e a contagem total de favoritações do item.
CREATE OR REPLACE FUNCTION public.alternar_favorito_biblioteca(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_existe boolean;
  v_count  int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_items WHERE id = p_item_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.content_favorites WHERE user_id = v_uid AND item_id = p_item_id
  ) INTO v_existe;

  IF v_existe THEN
    DELETE FROM public.content_favorites WHERE user_id = v_uid AND item_id = p_item_id;
  ELSE
    INSERT INTO public.content_favorites (user_id, item_id) VALUES (v_uid, p_item_id)
    ON CONFLICT (user_id, item_id) DO NOTHING;
  END IF;

  SELECT count(*) INTO v_count FROM public.content_favorites WHERE item_id = p_item_id;

  RETURN jsonb_build_object('is_favorited', NOT v_existe, 'favorite_count', v_count);
END $fn$;

REVOKE ALL ON FUNCTION public.alternar_favorito_biblioteca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alternar_favorito_biblioteca(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Lista de autores para o filtro "Autoria: (Usuário)" — só quem tem
--    algum item na Biblioteca (visível ao usuário atual, mesmo critério já
--    usado em listar_biblioteca).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_autores_biblioteca()
RETURNS TABLE (user_id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT DISTINCT i.owner_user_id, COALESCE(p.nome_completo, 'Sem nome')
    FROM public.content_items i
    LEFT JOIN public.profiles p ON p.user_id = i.owner_user_id
   WHERE i.deleted_at IS NULL
   ORDER BY 2;
$fn$;

REVOKE ALL ON FUNCTION public.listar_autores_biblioteca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_autores_biblioteca() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) listar_biblioteca — novos parâmetros (autoria por usuário específico,
--    só favoritos, ordenação por ranking) e novas colunas de retorno
--    (favorite_count, is_favorited, access_count, owner_nome).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_biblioteca(public.content_kind, uuid, text, boolean, int, int);

CREATE FUNCTION public.listar_biblioteca(
  p_kind            public.content_kind DEFAULT NULL,
  p_category_id     uuid DEFAULT NULL,
  p_query           text DEFAULT NULL,
  p_apenas_meus     boolean DEFAULT false,
  p_owner_user_id   uuid DEFAULT NULL,
  p_favoritos_apenas boolean DEFAULT false,
  p_order_by        text DEFAULT 'recentes',
  p_limit           int DEFAULT 50,
  p_offset          int DEFAULT 0
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
  access_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_q text; v_order text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_q := NULLIF(trim(COALESCE(p_query, '')), '');
  v_order := COALESCE(NULLIF(trim(p_order_by), ''), 'recentes');

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
           i.access_count
      FROM public.content_items i
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.profiles p ON p.user_id = i.owner_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS cnt FROM public.content_favorites f WHERE f.item_id = i.id
      ) fc ON true
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
  public.content_kind, uuid, text, boolean, uuid, boolean, text, int, int
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_biblioteca(
  public.content_kind, uuid, text, boolean, uuid, boolean, text, int, int
) TO authenticated;
