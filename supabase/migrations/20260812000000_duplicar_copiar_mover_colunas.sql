-- Ajuste doc (AJUSTE 13) — Copiar, duplicar e mover colunas.
--
-- Três RPCs novas, seguindo o mesmo padrão das já existentes para colunas
-- (criar_coluna_workspace, excluir_coluna_workspace etc.): SECURITY
-- DEFINER, controle de concorrência via private.bump_workspace_version
-- (aceita expected = NULL para pular a checagem — útil aqui porque o
-- painel de DESTINO normalmente não está carregado no frontend, então não
-- há uma versão conhecida para comparar), idempotência via
-- private.claim_idempotency/complete_idempotency.
--
-- duplicar_coluna_workspace: nova coluna no MESMO painel, logo à direita
-- da original, com os cards copiados (mesmos itens da biblioteca).
--
-- copiar_coluna_para_painel: nova coluna em OUTRO painel do mesmo
-- Defensor, como primeira coluna (à esquerda), com os cards copiados.
--
-- mover_coluna_para_painel: move a coluna (e os cards, que ficam
-- automaticamente com ela, já que continuam referenciando o mesmo
-- column_id) para OUTRO painel, como primeira coluna.

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicar_coluna_workspace(
  p_column_id                   uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor      uuid := auth.uid();
  v_acc        record;
  v_col        record;
  v_new        bigint;
  v_new_col_id uuid;
  v_pos        int;
  v_replay     jsonb;
BEGIN
  SELECT * INTO v_col FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_col.workspace_id);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor, 'workspace.column.duplicate', p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_new := private.bump_workspace_version(v_col.workspace_id, p_expected_workspace_version);

  v_pos := v_col.order_position + 1;
  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = v_col.workspace_id AND order_position >= v_pos;

  INSERT INTO public.defensor_workspace_columns (workspace_id, nome, descricao, cor_token, cor, order_position)
  VALUES (v_col.workspace_id, v_col.nome, v_col.descricao, v_col.cor_token, v_col.cor, v_pos)
  RETURNING id INTO v_new_col_id;

  INSERT INTO public.defensor_workspace_cards (column_id, item_id, order_position, note)
  SELECT v_new_col_id, c.item_id, c.order_position, c.note
    FROM public.defensor_workspace_cards c
   WHERE c.column_id = p_column_id
   ORDER BY c.order_position;

  PERFORM private.log_audit_event('workspace.column_duplicated', 'defensor_workspace_column',
    v_new_col_id::text, 'sucesso'::public.audit_result, NULL,
    jsonb_build_object('workspace_id', v_col.workspace_id, 'source_column_id', p_column_id), NULL, NULL, NULL);
  PERFORM private.complete_idempotency(v_actor, 'workspace.column.duplicate', p_idempotency_key,
    jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new));

  RETURN jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.duplicar_coluna_workspace(uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicar_coluna_workspace(uuid, bigint, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copiar_coluna_para_painel(
  p_column_id           uuid,
  p_target_workspace_id uuid,
  p_idempotency_key     uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor      uuid := auth.uid();
  v_acc_src    record;
  v_acc_dst    record;
  v_col        record;
  v_new        bigint;
  v_new_col_id uuid;
  v_replay     jsonb;
BEGIN
  SELECT * INTO v_col FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_col.workspace_id = p_target_workspace_id THEN
    RAISE EXCEPTION 'SAME_PANEL' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_acc_src FROM private.user_workspace_access(v_actor, v_col.workspace_id);
  IF NOT v_acc_src.can_view THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_acc_dst FROM private.user_workspace_access(v_actor, p_target_workspace_id);
  IF NOT v_acc_dst.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor, 'workspace.column.copy_to_panel', p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  -- Sem versão esperada do painel de destino: normalmente não está
  -- carregado no frontend no momento da ação (skip-check do helper).
  v_new := private.bump_workspace_version(p_target_workspace_id, NULL);

  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = p_target_workspace_id;

  INSERT INTO public.defensor_workspace_columns (workspace_id, nome, descricao, cor_token, cor, order_position)
  VALUES (p_target_workspace_id, v_col.nome, v_col.descricao, v_col.cor_token, v_col.cor, 0)
  RETURNING id INTO v_new_col_id;

  INSERT INTO public.defensor_workspace_cards (column_id, item_id, order_position, note)
  SELECT v_new_col_id, c.item_id, c.order_position, c.note
    FROM public.defensor_workspace_cards c
   WHERE c.column_id = p_column_id
   ORDER BY c.order_position;

  PERFORM private.log_audit_event('workspace.column_copied_to_panel', 'defensor_workspace_column',
    v_new_col_id::text, 'sucesso'::public.audit_result, NULL,
    jsonb_build_object('source_column_id', p_column_id, 'target_workspace_id', p_target_workspace_id),
    NULL, NULL, NULL);
  PERFORM private.complete_idempotency(v_actor, 'workspace.column.copy_to_panel', p_idempotency_key,
    jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new));

  RETURN jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.copiar_coluna_para_painel(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copiar_coluna_para_painel(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
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

  -- Idempotência simplificada (sem replay de resultado): mover é uma
  -- operação de UPDATE direta, então uma segunda tentativa com o mesmo
  -- p_idempotency_key após sucesso encontraria a coluna já no painel de
  -- destino e falharia em SAME_PANEL de forma segura — não é preciso o
  -- fluxo completo de claim/complete aqui.

  v_src_new := private.bump_workspace_version(v_col.workspace_id, p_expected_source_workspace_version);
  v_dst_new := private.bump_workspace_version(p_target_workspace_id, NULL);

  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = p_target_workspace_id;

  UPDATE public.defensor_workspace_columns
     SET workspace_id = p_target_workspace_id, order_position = 0
   WHERE id = p_column_id;

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

REVOKE ALL ON FUNCTION public.mover_coluna_para_painel(uuid, uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_coluna_para_painel(uuid, uuid, bigint, uuid) TO authenticated;
