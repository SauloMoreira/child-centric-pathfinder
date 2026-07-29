-- Ajuste doc — permitir excluir uma coluna do Painel mesmo que ela possua
-- cards, sem exigir a seleção de uma coluna de destino para remanejá-los.
-- Antes, excluir_coluna_workspace() exigia p_destination_column_id quando a
-- coluna tinha cards (RAISE COLUMN_NOT_EMPTY). Agora, quando o destino não é
-- informado (NULL), os cards da coluna são simplesmente excluídos junto com
-- ela — "os cards adicionados não serão remanejados". O comportamento de
-- mover os cards para outra coluna (quando um destino válido é informado)
-- é mantido, para não quebrar nenhum uso futuro dessa opção.
CREATE OR REPLACE FUNCTION public.excluir_coluna_workspace(
  p_column_id                   uuid,
  p_destination_column_id       uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_dest_ws uuid; v_acc record;
  v_cnt int; v_total int; v_new bigint; v_replay jsonb; v_dest_pos int; v_shift int;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.delete',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  SELECT count(*) INTO v_total FROM public.defensor_workspace_columns WHERE workspace_id = v_ws;
  IF v_total <= 1 THEN RAISE EXCEPTION 'LAST_WORKSPACE_COLUMN' USING ERRCODE='23514'; END IF;

  SELECT count(*) INTO v_cnt FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  IF v_cnt > 0 AND p_destination_column_id IS NOT NULL THEN
    IF p_destination_column_id = p_column_id THEN
      RAISE EXCEPTION 'COLUMN_NOT_EMPTY' USING ERRCODE='23514';
    END IF;
    SELECT workspace_id INTO v_dest_ws FROM public.defensor_workspace_columns
      WHERE id = p_destination_column_id;
    IF v_dest_ws IS NULL OR v_dest_ws <> v_ws THEN
      RAISE EXCEPTION 'COLUMN_WORKSPACE_MISMATCH' USING ERRCODE='23514';
    END IF;
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  IF v_cnt > 0 AND p_destination_column_id IS NOT NULL THEN
    -- Destino informado: remaneja os cards preservando ordem relativa.
    SELECT COALESCE(max(order_position),-1)+1 INTO v_dest_pos
      FROM public.defensor_workspace_cards WHERE column_id = p_destination_column_id;
    UPDATE public.defensor_workspace_cards
       SET column_id = p_destination_column_id,
           order_position = v_dest_pos + order_position,
           updated_at = now()
     WHERE column_id = p_column_id;
  ELSIF v_cnt > 0 THEN
    -- Sem destino: os cards são descartados junto com a coluna.
    DELETE FROM public.defensor_workspace_cards WHERE column_id = p_column_id;
  END IF;

  DELETE FROM public.defensor_workspace_columns WHERE id = p_column_id;

  -- reordena posições restantes (0..n-1) sem violar unique deferível
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY order_position) - 1 AS pos
      FROM public.defensor_workspace_columns WHERE workspace_id = v_ws
  )
  UPDATE public.defensor_workspace_columns c
     SET order_position = r.pos
    FROM ranked r WHERE c.id = r.id AND c.order_position <> r.pos;

  PERFORM private.log_audit_event('workspace.column_deleted','defensor_workspace_column',
    p_column_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'destination_column_id', p_destination_column_id,
      'affected_cards', v_cnt, 'cards_deleted', (v_cnt > 0 AND p_destination_column_id IS NULL)),
    NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.delete',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.excluir_coluna_workspace(uuid,uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_coluna_workspace(uuid,uuid,bigint,uuid) TO authenticated;
