CREATE OR REPLACE FUNCTION public.defensor_autovincular_orgao(
  p_orgao_id uuid,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_status public.profile_status;
  v_ativo boolean;
  v_correlation uuid := gen_random_uuid();
  v_idem jsonb;
  v_existing uuid;
  v_created boolean := false;
  v_ctx_result jsonb;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'correlationId', v_correlation);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_user, 'defensor_autovincular_orgao', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT p.status, p.ativo INTO v_status, v_ativo
    FROM public.profiles p
   WHERE p.user_id = v_user;

  IF v_status IS DISTINCT FROM 'ativo'::public.profile_status
     OR v_ativo IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_INACTIVE', 'correlationId', v_correlation);
  END IF;

  v_role := private.current_user_role();
  IF v_role IS DISTINCT FROM 'defensor_publico'::public.app_role THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'correlationId', v_correlation);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_FOUND', 'correlationId', v_correlation);
  END IF;

  SELECT m.id INTO v_existing
    FROM private.user_org_memberships m
   WHERE m.user_id = v_user
     AND m.orgao_id = p_orgao_id
     AND m.ativo = TRUE
     AND m.tipo_vinculo = 'defensor'::private.membership_type_enum
   LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO private.user_org_memberships (
      user_id, orgao_id, ativo, since, granted_by,
      tipo_vinculo, correlation_id
    ) VALUES (
      v_user, p_orgao_id, TRUE, now(), v_user,
      'defensor'::private.membership_type_enum, v_correlation
    );
    v_created := true;

    PERFORM private.log_audit_event(
      'defender.self_service_membership_created',
      'private.user_org_memberships',
      v_user::text,
      'sucesso'::public.audit_result,
      NULL,
      jsonb_build_object(
        'orgao_id', p_orgao_id,
        'correlation_id', v_correlation,
        'motivo', 'Autoatendimento pelo defensor via Minha conta'
      ),
      p_orgao_id, v_correlation, v_role
    );
  END IF;

  -- Reaproveita a rotina de troca de contexto (valida acesso, versiona e audita).
  v_ctx_result := public.selecionar_contexto_orgao(p_orgao_id, NULL, NULL);

  IF (v_ctx_result->>'ok')::boolean IS DISTINCT FROM TRUE THEN
    RETURN v_ctx_result;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'DEFENDER_SELF_ATTACHED',
    'created', v_created,
    'contextoAtual', v_ctx_result->'contextoAtual',
    'version', v_ctx_result->'version',
    'correlationId', v_correlation
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM private.complete_idempotency(v_user, 'defensor_autovincular_orgao', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.defensor_autovincular_orgao(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defensor_autovincular_orgao(uuid, uuid) TO authenticated;