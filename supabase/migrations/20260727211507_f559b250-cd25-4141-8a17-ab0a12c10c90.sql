CREATE OR REPLACE FUNCTION public.listar_convites_equipe(p_orgao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, orgao_execucao_id uuid, email text, nome_completo text, matricula text, funcao_interna text, outra_funcao text, telefone text, status team_invitation_status, invited_by uuid, sent_at timestamp with time zone, expires_at timestamp with time zone, resend_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_orgao uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF private.is_admin_tecnico() OR private.current_user_is_admin() THEN
    v_orgao := p_orgao_id;
  ELSIF private.is_defensor_publico() THEN
    v_orgao := private.current_active_org_id();
    IF v_orgao IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501'; END IF;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  UPDATE private.team_invitations ti
     SET status = 'expirado'
   WHERE ti.status IN ('preparando','enviado')
     AND ti.expires_at < now()
     AND (v_orgao IS NULL OR ti.orgao_execucao_id = v_orgao);

  RETURN QUERY
    SELECT ti.id, ti.orgao_execucao_id, ti.email, ti.nome_completo,
           ti.matricula, ti.funcao_interna, ti.outra_funcao, ti.telefone,
           ti.status, ti.invited_by, ti.sent_at, ti.expires_at,
           ti.resend_count, ti.created_at
      FROM private.team_invitations ti
     WHERE (v_orgao IS NULL OR ti.orgao_execucao_id = v_orgao)
     ORDER BY ti.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_convites_equipe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_convites_equipe(uuid) TO authenticated;