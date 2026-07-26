CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', to_jsonb(p) - 'user_id',
    'user_id', v_uid,
    'roles', COALESCE((
      SELECT jsonb_agg(ur.role::text)
        FROM private.user_roles ur
       WHERE ur.user_id = v_uid AND ur.revoked_at IS NULL
    ), '[]'::jsonb),
    'aal2', private.current_user_has_aal2(),
    'orgao_ativo', (
      SELECT jsonb_build_object('id', oe.id, 'nome', oe.nome, 'comarca', oe.comarca)
        FROM private.user_org_memberships m
        JOIN public.orgaos_execucao oe ON oe.id = m.orgao_id
       WHERE m.user_id = v_uid AND m.ativo = true
       LIMIT 1
    ),
    'solicitacao_aberta', (
      SELECT jsonb_build_object('id', ar.id, 'status', ar.status, 'version', ar.version, 'created_at', ar.created_at)
        FROM private.access_requests ar
       WHERE ar.user_id = v_uid AND ar.status IN ('pendente','em_analise')
       ORDER BY ar.created_at DESC LIMIT 1
    )
  )
  INTO v_result
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  RETURN COALESCE(v_result, jsonb_build_object('user_id', v_uid, 'profile', NULL, 'roles', '[]'::jsonb));
END;
$function$;