-- Ajuste doc — a Biblioteca já permite favoritar pelo card (3 pontinhos/
-- estrela). Falta a segunda metade do pedido: favoritar também "dentro dos
-- Atendimento e Cotas (botão/ícone de estrelinha)". As caixas de detalhe
-- (AtendimentoDetailSheet/CotaDetailSheet) usam obter_atendimento_detalhe/
-- obter_cota_detalhe, que não trazem favorito/contagem — em vez de
-- sobrecarregar essas RPCs (usadas também fora do contexto de Biblioteca),
-- criamos uma consulta pontual e leve, no mesmo padrão de
-- alternar_favorito_biblioteca/listar_biblioteca.
CREATE OR REPLACE FUNCTION public.obter_favorito_biblioteca(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
  v_is_favorited boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_items WHERE id = p_item_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT count(*) INTO v_count FROM public.content_favorites WHERE item_id = p_item_id;
  SELECT EXISTS (
    SELECT 1 FROM public.content_favorites WHERE user_id = v_uid AND item_id = p_item_id
  ) INTO v_is_favorited;

  RETURN jsonb_build_object('is_favorited', v_is_favorited, 'favorite_count', v_count);
END $fn$;

REVOKE ALL ON FUNCTION public.obter_favorito_biblioteca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_favorito_biblioteca(uuid) TO authenticated;
