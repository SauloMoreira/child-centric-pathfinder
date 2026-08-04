-- Ajuste doc (AJUSTE 13, bloco "Área de Trabalho — Painéis"): não deve
-- haver mais limites para criação de Painéis pelo usuário. Esta migration
-- remove a trava dura de 8 Painéis por Defensor na RPC criar_painel
-- (contrato antigo, também removido do front em PANEL_MAX/PANEL_LIMIT).
--
-- Todo o resto da função permanece idêntico ao definido em
-- 20260730000000_ajustes_painel_sem_coluna_e_cota_obrigatoria.sql — só o
-- bloco "IF v_count >= 8 THEN RAISE EXCEPTION 'PANEL_LIMIT_REACHED' ..."
-- foi removido.

CREATE OR REPLACE FUNCTION public.criar_painel(
  p_defensor_user_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL,
  p_expected_count integer DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_lock_key bigint;
  v_count int; v_pos int; v_id uuid;
  v_name text; v_icon text; v_name_norm text;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_name := private.validate_panel_name(p_nome);
  v_icon := private.validate_panel_icon(p_icone);
  v_name_norm := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*) INTO v_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  IF p_expected_count IS NOT NULL AND p_expected_count <> v_count THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  -- Ajuste doc (AJUSTE 13) — limite de 8 Painéis removido por completo.

  IF EXISTS (SELECT 1 FROM public.defensor_workspaces
              WHERE defensor_user_id = p_defensor_user_id
                AND archived_at IS NULL
                AND nome_normalizado = v_name_norm) THEN
    RAISE EXCEPTION 'PANEL_NAME_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  INSERT INTO public.defensor_workspaces (defensor_user_id, nome, icone, order_position)
  VALUES (p_defensor_user_id, v_name, v_icon, v_pos)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('panel.created','defensor_workspace',
    v_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('position', v_pos), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object(
      'panelId', v_id, 'initialColumnId', NULL,
      'orderPosition', v_pos, 'optimisticVersion', 1);
    PERFORM private.complete_idempotency(v_actor,'panel.create',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) TO authenticated;
