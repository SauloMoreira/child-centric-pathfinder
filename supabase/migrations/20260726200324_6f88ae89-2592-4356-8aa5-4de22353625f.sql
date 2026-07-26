CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mem RECORD;
  v_org RECORD;
  v_comarcas jsonb;
  v_comarca_principal text;
  v_profile RECORD;
  v_roles jsonb;
  v_aal2 boolean := false;
  v_solicitacao jsonb;
  v_orgao_ativo jsonb;
  v_jwt jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('autenticado', false); END IF;

  BEGIN
    v_jwt := auth.jwt();
    v_aal2 := coalesce((v_jwt->>'aal') = 'aal2', false);
  EXCEPTION WHEN OTHERS THEN v_aal2 := false;
  END;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;

  SELECT id, orgao_id, since, ativo
    INTO v_mem
    FROM private.user_org_memberships
   WHERE user_id = v_uid AND ativo = true
   ORDER BY since DESC LIMIT 1;

  SELECT coalesce(jsonb_agg(role::text ORDER BY role::text), '[]'::jsonb) INTO v_roles
    FROM public.user_roles WHERE user_id = v_uid;

  SELECT to_jsonb(s.*) INTO v_solicitacao
    FROM (
      SELECT id, status::text, version, created_at
        FROM public.access_requests
       WHERE user_id = v_uid AND status IN ('pendente','em_analise')
       ORDER BY created_at DESC LIMIT 1
    ) s;

  IF v_mem.orgao_id IS NULL THEN
    RETURN jsonb_build_object(
      'autenticado', true,
      'user_id', v_uid,
      'profile', to_jsonb(v_profile),
      'roles', v_roles,
      'aal2', v_aal2,
      'orgao_ativo', NULL,
      'membership', NULL,
      'comarcas', '[]'::jsonb,
      'solicitacao_aberta', v_solicitacao,
      'is_admin_tecnico', private.is_admin_tecnico()
    );
  END IF;

  SELECT id, nome INTO v_org FROM public.orgaos_execucao WHERE id = v_mem.orgao_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nome', c.nome, 'principal', oc.is_principal
         ) ORDER BY oc.is_principal DESC, c.nome), '[]'::jsonb)
    INTO v_comarcas
    FROM public.orgao_comarcas oc
    JOIN public.comarcas c ON c.id = oc.comarca_id
   WHERE oc.orgao_execucao_id = v_mem.orgao_id;

  SELECT c.nome INTO v_comarca_principal
    FROM public.orgao_comarcas oc
    JOIN public.comarcas c ON c.id = oc.comarca_id
   WHERE oc.orgao_execucao_id = v_mem.orgao_id AND oc.is_principal = true
   LIMIT 1;

  v_orgao_ativo := jsonb_build_object(
    'id', v_org.id, 'nome', v_org.nome, 'comarca', v_comarca_principal
  );

  RETURN jsonb_build_object(
    'autenticado', true,
    'user_id', v_uid,
    'profile', to_jsonb(v_profile),
    'roles', v_roles,
    'aal2', v_aal2,
    'orgao_ativo', v_orgao_ativo,
    'membership', jsonb_build_object(
      'id', v_mem.id, 'dataInicio', v_mem.since,
      'status', CASE WHEN v_mem.ativo THEN 'ativo' ELSE 'encerrado' END
    ),
    'comarcas', v_comarcas,
    'solicitacao_aberta', v_solicitacao,
    'is_admin_tecnico', private.is_admin_tecnico()
  );
END $$;