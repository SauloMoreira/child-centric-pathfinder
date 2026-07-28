-- Ajustes da Área de Trabalho (1/4) — mesma cota/atendimento pode ser
-- adicionado em mais de uma coluna do mesmo Painel (cards "duplicados" entre
-- colunas), mas não duas vezes na MESMA coluna.
--
-- Hoje a unicidade é (workspace_id, item_id): um item só pode aparecer uma
-- vez em todo o Painel, em qualquer coluna. Passa a ser (column_id, item_id).

-- ---------------------------------------------------------------------------
-- 1) Constraint: unicidade por coluna, não mais por painel inteiro
-- ---------------------------------------------------------------------------
ALTER TABLE public.defensor_workspace_cards
  DROP CONSTRAINT IF EXISTS defensor_workspace_cards_workspace_item_key;

ALTER TABLE public.defensor_workspace_cards
  DROP CONSTRAINT IF EXISTS defensor_workspace_cards_column_item_key;
ALTER TABLE public.defensor_workspace_cards
  ADD CONSTRAINT defensor_workspace_cards_column_item_key
    UNIQUE (column_id, item_id);

-- ---------------------------------------------------------------------------
-- 2) adicionar_card_workspace — checagem de duplicidade agora por coluna
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
-- 3) mover_card_workspace — passa a checar duplicidade na coluna destino
--    (antes não precisava: só existia uma linha por item em todo o painel)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mover_card_workspace(
  p_card_id                     uuid,
  p_target_column_id            uuid,
  p_new_position                integer,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_src_col uuid; v_dst_ws uuid; v_src_pos int;
  v_acc record; v_new bigint; v_replay jsonb; v_max int; v_item uuid;
BEGIN
  SELECT workspace_id, column_id, order_position, item_id
    INTO v_ws, v_src_col, v_src_pos, v_item
    FROM public.defensor_workspace_cards WHERE id = p_card_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT workspace_id INTO v_dst_ws
    FROM public.defensor_workspace_columns WHERE id = p_target_column_id;
  IF v_dst_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_dst_ws <> v_ws THEN RAISE EXCEPTION 'COLUMN_WORKSPACE_MISMATCH' USING ERRCODE='23514'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_move_cards THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF p_target_column_id <> v_src_col AND EXISTS (
    SELECT 1 FROM public.defensor_workspace_cards
     WHERE column_id = p_target_column_id AND item_id = v_item AND id <> p_card_id
  ) THEN
    RAISE EXCEPTION 'ITEM_ALREADY_IN_COLUMN' USING ERRCODE='23505';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.card.move',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  -- 1) tira o card da coluna de origem posicionando temporariamente
  UPDATE public.defensor_workspace_cards
     SET order_position = -1000000, updated_at = now()
   WHERE id = p_card_id;

  -- 2) fecha o buraco na origem
  UPDATE public.defensor_workspace_cards
     SET order_position = order_position - 1
   WHERE column_id = v_src_col AND order_position > v_src_pos AND id <> p_card_id;

  -- 3) abre espaço no destino
  SELECT count(*) INTO v_max FROM public.defensor_workspace_cards WHERE column_id = p_target_column_id AND id <> p_card_id;
  IF p_new_position < 0 THEN p_new_position := 0; END IF;
  IF p_new_position > v_max THEN p_new_position := v_max; END IF;

  UPDATE public.defensor_workspace_cards
     SET order_position = order_position + 1
   WHERE column_id = p_target_column_id
     AND order_position >= p_new_position
     AND id <> p_card_id;

  -- 4) posiciona o card
  UPDATE public.defensor_workspace_cards
     SET column_id = p_target_column_id, order_position = p_new_position, updated_at = now()
   WHERE id = p_card_id;

  PERFORM private.log_audit_event('workspace.card_moved','defensor_workspace_card',
    p_card_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'from_column', v_src_col, 'to_column', p_target_column_id, 'to_pos', p_new_position),
    NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.card.move',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.mover_card_workspace(uuid,uuid,integer,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_card_workspace(uuid,uuid,integer,bigint,uuid) TO authenticated;
