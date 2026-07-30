-- Correção de mais um bug real em mover_coluna_para_painel, encontrado ao
-- testar "Mover para…" (erro 23503 — violação de chave estrangeira):
--
-- A ordem das operações estava errada: a função primeiro atualizava
-- defensor_workspace_columns.workspace_id (mudando a coluna de painel) e
-- só DEPOIS excluía/reinseria os cards. Nesse instante intermediário, os
-- cards antigos ainda referenciavam (column_id, workspace_id=ORIGEM) via
-- a FK composta defensor_workspace_cards_column_ws_fk, mas a linha da
-- coluna já tinha mudado para workspace_id=DESTINO — quebrando a
-- referência ("update ... violates foreign key constraint").
--
-- Corrigido invertendo a ordem: 1) captura os cards da coluna numa tabela
-- temporária; 2) exclui os cards (a referência antiga desaparece);
-- 3) só então move a coluna (workspace_id) — nesse ponto não há mais
-- cards referenciando a linha, então a FK não é violada; 4) reinsere os
-- cards já com o workspace_id de destino (que agora bate com a coluna).

CREATE OR REPLACE FUNCTION public.mover_coluna_para_painel(
  p_column_id                          uuid,
  p_target_workspace_id                uuid,
  p_expected_source_workspace_version  bigint,
  p_idempotency_key                    uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor       uuid := auth.uid();
  v_acc_src     record;
  v_acc_dst     record;
  v_col         record;
  v_src_new     bigint;
  v_dst_new     bigint;
BEGIN
  SELECT * INTO v_col FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_col.workspace_id = p_target_workspace_id THEN
    RAISE EXCEPTION 'SAME_PANEL' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_acc_src FROM private.user_workspace_access(v_actor, v_col.workspace_id);
  IF NOT v_acc_src.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_acc_dst FROM private.user_workspace_access(v_actor, p_target_workspace_id);
  IF NOT v_acc_dst.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_src_new := private.bump_workspace_version(v_col.workspace_id, p_expected_source_workspace_version);
  v_dst_new := private.bump_workspace_version(p_target_workspace_id, NULL);

  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = p_target_workspace_id;

  -- 1) captura os cards da coluna antes de mexer em qualquer coisa
  CREATE TEMP TABLE tmp_cards_movidos ON COMMIT DROP AS
  SELECT item_id, order_position
    FROM public.defensor_workspace_cards
   WHERE column_id = p_column_id;

  -- 2) exclui os cards (a referência antiga à coluna desaparece)
  DELETE FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  -- 3) só agora move a coluna — sem cards referenciando, a FK composta
  --    (column_id, workspace_id) não é violada.
  UPDATE public.defensor_workspace_columns
     SET workspace_id = p_target_workspace_id, order_position = 0
   WHERE id = p_column_id;

  -- 4) reinsere os cards já com o workspace_id de destino (trigger de
  --    imutabilidade só bloqueia UPDATE, não INSERT). Se o mesmo item já
  --    existir nessa coluna por algum motivo, é pulado defensivamente.
  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  SELECT p_column_id, p_target_workspace_id, item_id, order_position
    FROM tmp_cards_movidos
  ON CONFLICT (column_id, item_id) DO NOTHING;

  -- Fecha o buraco deixado no painel de origem.
  UPDATE public.defensor_workspace_columns c
     SET order_position = ranked.rn - 1
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_position) AS rn
        FROM public.defensor_workspace_columns
       WHERE workspace_id = v_col.workspace_id
    ) ranked
   WHERE c.id = ranked.id;

  PERFORM private.log_audit_event('workspace.column_moved_to_panel', 'defensor_workspace_column',
    p_column_id::text, 'sucesso'::public.audit_result, NULL,
    jsonb_build_object('source_workspace_id', v_col.workspace_id, 'target_workspace_id', p_target_workspace_id),
    NULL, NULL, NULL);

  RETURN jsonb_build_object(
    'column_id', p_column_id,
    'source_workspace_version', v_src_new,
    'target_workspace_version', v_dst_new
  );
END $fn$;
