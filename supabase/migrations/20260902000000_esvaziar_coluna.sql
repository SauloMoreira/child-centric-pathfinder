-- Ajuste doc (novo AJUSTE 2) — botão "Esvaziar coluna": remove todos os
-- cards da coluna de uma vez, sem excluir a coluna em si nem o conteúdo
-- vinculado (Atendimentos/Cotas continuam existindo, só saem da coluna).

CREATE OR REPLACE FUNCTION public.esvaziar_coluna_workspace(
  p_column_id                   uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_replay jsonb;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.empty',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  DELETE FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_emptied','defensor_workspace_column',
    p_column_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.empty',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.esvaziar_coluna_workspace(uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esvaziar_coluna_workspace(uuid, bigint, uuid) TO authenticated;
