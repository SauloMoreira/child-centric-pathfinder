-- Correção de 3 bugs reais introduzidos na migration
-- 20260812000000_duplicar_copiar_mover_colunas.sql, encontrados ao testar
-- "Duplicar coluna" (erro genérico "Falha ao processar operação"):
--
-- 1. A coluna `note` foi removida de defensor_workspace_cards numa
--    migration anterior (20260727170817) — as INSERTs abaixo ainda a
--    referenciavam.
-- 2. `defensor_workspace_cards.workspace_id` é NOT NULL (denormalizado a
--    partir da coluna) e nunca era preenchido nas INSERTs — violação de
--    NOT NULL em toda tentativa de copiar cards.
-- 3. mover_coluna_para_painel: defensor_workspace_cards tem um trigger de
--    imutabilidade que BLOQUEIA UPDATE de workspace_id/item_id. Trocado
--    para excluir e reinserir os cards (INSERT novo, não UPDATE), que
--    respeita o trigger.
--
-- Nota corrigida sobre a regra de negócio: a restrição de item único NÃO
-- é mais por painel inteiro — a migration 20260729000000 já mudou a
-- unicidade de (workspace_id, item_id) para (column_id, item_id). Ou
-- seja, o mesmo Atendimento/Cota PODE aparecer em colunas diferentes do
-- mesmo painel; só não duas vezes na MESMA coluna. Isso significa que
-- duplicar_coluna_workspace PODE (e deve) copiar os cards normalmente,
-- já que a nova coluna tem um column_id novo.

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

  -- Cards copiados normalmente: a restrição de item único é por COLUNA
  -- (column_id, item_id), e a coluna duplicada tem um column_id novo, sem
  -- conflito possível com a coluna original.
  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  SELECT v_new_col_id, v_col.workspace_id, c.item_id, c.order_position
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

  v_new := private.bump_workspace_version(p_target_workspace_id, NULL);

  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = p_target_workspace_id;

  INSERT INTO public.defensor_workspace_columns (workspace_id, nome, descricao, cor_token, cor, order_position)
  VALUES (p_target_workspace_id, v_col.nome, v_col.descricao, v_col.cor_token, v_col.cor, 0)
  RETURNING id INTO v_new_col_id;

  -- Cards copiados para a nova coluna, já com o workspace_id do painel de
  -- destino. A restrição de item único é por COLUNA (column_id, item_id),
  -- e a coluna é nova — na prática o ON CONFLICT DO NOTHING aqui é só uma
  -- rede de segurança defensiva, não deveria disparar em uso normal.
  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  SELECT v_new_col_id, p_target_workspace_id, c.item_id, c.order_position
    FROM public.defensor_workspace_cards c
   WHERE c.column_id = p_column_id
   ORDER BY c.order_position
  ON CONFLICT (column_id, item_id) DO NOTHING;

  PERFORM private.log_audit_event('workspace.column_copied_to_panel', 'defensor_workspace_column',
    v_new_col_id::text, 'sucesso'::public.audit_result, NULL,
    jsonb_build_object('source_column_id', p_column_id, 'target_workspace_id', p_target_workspace_id),
    NULL, NULL, NULL);
  PERFORM private.complete_idempotency(v_actor, 'workspace.column.copy_to_panel', p_idempotency_key,
    jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new));

  RETURN jsonb_build_object('column_id', v_new_col_id, 'workspace_version', v_new);
END $fn$;

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

  v_src_new := private.bump_workspace_version(v_col.workspace_id, p_expected_source_workspace_version);
  v_dst_new := private.bump_workspace_version(p_target_workspace_id, NULL);

  UPDATE public.defensor_workspace_columns
     SET order_position = order_position + 1
   WHERE workspace_id = p_target_workspace_id;

  UPDATE public.defensor_workspace_columns
     SET workspace_id = p_target_workspace_id, order_position = 0
   WHERE id = p_column_id;

  -- defensor_workspace_cards tem um trigger que impede UPDATE do
  -- workspace_id (imutável). Por isso os cards são excluídos e
  -- reinseridos (INSERT novo respeita o trigger, que só bloqueia UPDATE).
  -- column_id não muda (a própria coluna é que muda de painel), então o
  -- ON CONFLICT (column_id, item_id) aqui também é só rede de segurança.
  WITH movidos AS (
    DELETE FROM public.defensor_workspace_cards
     WHERE column_id = p_column_id
    RETURNING item_id, order_position
  )
  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  SELECT p_column_id, p_target_workspace_id, item_id, order_position
    FROM movidos
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
