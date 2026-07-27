CREATE OR REPLACE FUNCTION public.reordenar_colunas_workspace(
  p_workspace_id uuid,
  p_ordered_column_ids uuid[],
  p_expected_workspace_version bigint,
  p_idempotency_key uuid
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record;
  v_new bigint;
  v_replay jsonb;
  v_current_ids uuid[];
  v_input_len int;
  v_current_len int;
  v_unique_len int;
  v_id uuid;
  v_pos int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF p_ordered_column_ids IS NULL OR array_length(p_ordered_column_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_workspace_id);
  IF NOT v_acc.can_manage_columns THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor, 'workspace.columns.reorder', p_idempotency_key);
  IF v_replay IS NOT NULL THEN
    RETURN (v_replay->'result'->>'workspace_version')::bigint;
  END IF;

  SELECT array_agg(id ORDER BY order_position) INTO v_current_ids
    FROM public.defensor_workspace_columns
   WHERE workspace_id = p_workspace_id;

  v_current_len := COALESCE(array_length(v_current_ids, 1), 0);
  v_input_len := array_length(p_ordered_column_ids, 1);

  SELECT COUNT(DISTINCT u) INTO v_unique_len
    FROM unnest(p_ordered_column_ids) AS u;

  IF v_input_len <> v_current_len OR v_unique_len <> v_input_len THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
  END IF;

  -- Todas as colunas fornecidas devem pertencer ao Painel
  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_column_ids) AS u
    WHERE u <> ALL(v_current_ids)
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
  END IF;

  v_new := private.bump_workspace_version(p_workspace_id, p_expected_workspace_version);

  -- Move todas as posições para o intervalo negativo para evitar conflitos de unicidade
  UPDATE public.defensor_workspace_columns
     SET order_position = -1000 - order_position
   WHERE workspace_id = p_workspace_id;

  v_pos := 0;
  FOREACH v_id IN ARRAY p_ordered_column_ids LOOP
    UPDATE public.defensor_workspace_columns
       SET order_position = v_pos
     WHERE id = v_id AND workspace_id = p_workspace_id;
    v_pos := v_pos + 1;
  END LOOP;

  PERFORM private.log_audit_event('workspace.columns_reordered','defensor_workspace',
    p_workspace_id::text,'sucesso'::public.audit_result,NULL,NULL,NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor, 'workspace.columns.reorder', p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));

  RETURN v_new;
END $function$;

REVOKE ALL ON FUNCTION public.reordenar_colunas_workspace(uuid, uuid[], bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_colunas_workspace(uuid, uuid[], bigint, uuid) TO authenticated;