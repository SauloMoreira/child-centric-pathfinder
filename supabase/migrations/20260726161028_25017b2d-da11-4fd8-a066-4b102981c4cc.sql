-- =========================================================
-- 0011_admin_tecnico_security.sql
-- Funções de autorização, policies e RPCs para o perfil admin_tecnico.
-- =========================================================

-- ---------- private.is_admin_tecnico ----------
CREATE OR REPLACE FUNCTION private.is_admin_tecnico()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.current_user_has_role('admin_tecnico'::public.app_role);
$$;
REVOKE ALL ON FUNCTION private.is_admin_tecnico() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin_tecnico() FROM anon;
GRANT  EXECUTE ON FUNCTION private.is_admin_tecnico() TO authenticated;
COMMENT ON FUNCTION private.is_admin_tecnico() IS
  'Autoridade técnica máxima. Nunca aceita user_id do cliente.';

-- ---------- private.is_admin_institucional ----------
CREATE OR REPLACE FUNCTION private.is_admin_institucional()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.current_user_has_role('admin_institucional'::public.app_role);
$$;
REVOKE ALL ON FUNCTION private.is_admin_institucional() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin_institucional() FROM anon;
GRANT  EXECUTE ON FUNCTION private.is_admin_institucional() TO authenticated;

-- ---------- private.is_defensor_publico ----------
CREATE OR REPLACE FUNCTION private.is_defensor_publico()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.current_user_has_role('defensor_publico'::public.app_role);
$$;
REVOKE ALL ON FUNCTION private.is_defensor_publico() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_defensor_publico() FROM anon;
GRANT  EXECUTE ON FUNCTION private.is_defensor_publico() TO authenticated;

-- ---------- private.is_membro_equipe ----------
CREATE OR REPLACE FUNCTION private.is_membro_equipe()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.current_user_has_role('membro_equipe'::public.app_role);
$$;
REVOKE ALL ON FUNCTION private.is_membro_equipe() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_membro_equipe() FROM anon;
GRANT  EXECUTE ON FUNCTION private.is_membro_equipe() TO authenticated;

-- ---------- private.is_global_admin ----------
-- Verdadeiro apenas para admin_tecnico. Modelo conservador: não
-- iguala admin_institucional a admin_tecnico. Onde ambos devem ter
-- acesso, a policy deve compor OR explícito.
CREATE OR REPLACE FUNCTION private.is_global_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.is_admin_tecnico();
$$;
REVOKE ALL ON FUNCTION private.is_global_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_global_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION private.is_global_admin() TO authenticated;

-- ---------- private.current_user_role ----------
-- Retorna o papel efetivo mais alto do usuário autenticado, respeitando hierarquia.
CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT ur.role
    FROM private.user_roles ur
   WHERE ur.user_id = auth.uid()
     AND ur.revoked_at IS NULL
   ORDER BY CASE ur.role
     WHEN 'admin_tecnico'        THEN 1
     WHEN 'admin_institucional'  THEN 2
     WHEN 'defensor_publico'     THEN 3
     WHEN 'membro_equipe'        THEN 4
   END ASC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_role() FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_user_role() TO authenticated;

-- ---------- private.current_active_org_id ----------
CREATE OR REPLACE FUNCTION private.current_active_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.orgao_id
    FROM private.user_org_memberships m
   WHERE m.user_id = auth.uid() AND m.ativo = true
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.current_active_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_active_org_id() FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_active_org_id() TO authenticated;

-- ---------- private.user_can_access_org ----------
-- Admin técnico acessa qualquer órgão. Demais só o vinculado ativo.
CREATE OR REPLACE FUNCTION private.user_can_access_org(p_orgao_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    private.is_admin_tecnico()
    OR EXISTS (
      SELECT 1
        FROM private.user_org_memberships m
       WHERE m.user_id = auth.uid()
         AND m.orgao_id = p_orgao_id
         AND m.ativo = true
    );
$$;
REVOKE ALL ON FUNCTION private.user_can_access_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_can_access_org(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION private.user_can_access_org(uuid) TO authenticated;

-- =========================================================
-- Atualização de policies para reconhecer admin_tecnico
-- =========================================================

-- Órgãos: admin_tecnico enxerga inclusive inativos
DROP POLICY IF EXISTS orgaos_execucao_select_authenticated ON public.orgaos_execucao;
CREATE POLICY orgaos_execucao_select_authenticated
  ON public.orgaos_execucao
  FOR SELECT
  TO authenticated
  USING (
    ativo = true
    OR public.tem_papel('admin_institucional'::public.app_role)
    OR public.tem_papel('admin_tecnico'::public.app_role)
  );

-- Profiles: admin_tecnico enxerga todos
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.tem_papel('admin_institucional'::public.app_role)
    OR public.tem_papel('admin_tecnico'::public.app_role)
  );

-- =========================================================
-- Atualizações das RPCs de solicitações para reconhecer admin_tecnico
-- =========================================================
CREATE OR REPLACE FUNCTION public.listar_solicitacoes_acesso(
  p_status public.access_request_status DEFAULT NULL,
  p_limit  integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nome_completo text,
  matricula text,
  cargo text,
  telefone text,
  orgao_id uuid,
  orgao_nome text,
  proposta_novo_orgao_nome text,
  proposta_novo_orgao_sigla text,
  proposta_novo_orgao_comarca text,
  proposta_novo_orgao_cidade text,
  status public.access_request_status,
  version integer,
  correlation_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT (private.current_user_is_admin() OR private.is_admin_tecnico()) THEN
    RAISE EXCEPTION 'Apenas administradores institucionais ou técnicos podem listar solicitações.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT ar.id, ar.user_id, ar.nome_completo, ar.matricula, ar.cargo, ar.telefone,
           ar.orgao_id, oe.nome AS orgao_nome,
           ar.proposta_novo_orgao_nome, ar.proposta_novo_orgao_sigla,
           ar.proposta_novo_orgao_comarca, ar.proposta_novo_orgao_cidade,
           ar.status, ar.version, ar.correlation_id, ar.created_at
      FROM private.access_requests ar
      LEFT JOIN public.orgaos_execucao oe ON oe.id = ar.orgao_id
     WHERE (p_status IS NULL OR ar.status = p_status)
     ORDER BY ar.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200));
END;
$$;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_acesso(
  p_request_id uuid,
  p_version integer,
  p_orgao_final_id uuid,
  p_criar_novo boolean DEFAULT false,
  p_novo_orgao jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
  v_orgao_id uuid;
  v_actor_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF private.is_admin_tecnico() THEN
    v_actor_role := 'admin_tecnico';
  ELSIF private.current_user_is_admin() THEN
    v_actor_role := 'admin_institucional';
  ELSE
    RAISE EXCEPTION 'Ação restrita a administrador institucional ou técnico.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para aprovar solicitações.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM private.access_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '02000';
  END IF;

  IF v_req.status = 'aprovada' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status','aprovada');
  END IF;

  IF v_req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitação em estado % não pode ser aprovada.', v_req.status
      USING ERRCODE = '22023';
  END IF;

  IF v_req.version <> p_version THEN
    RAISE EXCEPTION 'Solicitação foi modificada por outro processo. Recarregue.'
      USING ERRCODE = '40001';
  END IF;

  IF p_criar_novo THEN
    IF p_novo_orgao IS NULL
       OR COALESCE(btrim(p_novo_orgao->>'nome'),'') = ''
       OR COALESCE(btrim(p_novo_orgao->>'sigla'),'') = '' THEN
      RAISE EXCEPTION 'Novo órgão exige nome e sigla.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.orgaos_execucao (nome, sigla, comarca, cidade, uf, ativo, criado_por)
    VALUES (
      btrim(p_novo_orgao->>'nome'),
      btrim(p_novo_orgao->>'sigla'),
      NULLIF(btrim(p_novo_orgao->>'comarca'),''),
      NULLIF(btrim(p_novo_orgao->>'cidade'),''),
      COALESCE(NULLIF(btrim(p_novo_orgao->>'uf'),''), 'RS'),
      true, v_uid
    )
    ON CONFLICT (sigla) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_orgao_id;
  ELSE
    IF p_orgao_final_id IS NULL THEN
      RAISE EXCEPTION 'Órgão final é obrigatório.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_orgao_id FROM public.orgaos_execucao
     WHERE id = p_orgao_final_id AND ativo = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Órgão final inválido ou inativo.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (v_req.user_id, 'defensor_publico', v_uid, v_req.correlation_id)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL;

  UPDATE private.user_org_memberships
     SET ativo = false, until = now(), ended_by = v_uid,
         motivo_encerramento = 'substituido_por_nova_aprovacao'
   WHERE user_id = v_req.user_id AND ativo = true;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by, correlation_id)
  VALUES (v_req.user_id, v_orgao_id, v_uid, v_req.correlation_id);

  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = v_req.user_id;

  UPDATE private.access_requests
     SET status = 'aprovada',
         version = version + 1,
         decidido_por = v_uid,
         decidido_em = now(),
         orgao_final_id = v_orgao_id,
         updated_at = now()
   WHERE id = p_request_id;

  PERFORM private.log_audit_event(
    'access_request.approve','access_request', p_request_id::text,
    'sucesso',
    jsonb_build_object('status', jsonb_build_object('from', v_req.status, 'to','aprovada')),
    jsonb_build_object('orgao_final_id', v_orgao_id, 'novo_orgao', p_criar_novo),
    v_orgao_id, v_req.correlation_id, v_actor_role
  );

  RETURN jsonb_build_object('ok', true, 'status','aprovada', 'orgao_id', v_orgao_id);
END;
$$;
REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid, integer, uuid, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid, integer, uuid, boolean, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.aprovar_solicitacao_acesso(uuid, integer, uuid, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rejeitar_solicitacao_acesso(
  p_request_id uuid, p_version integer, p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
  v_actor_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF private.is_admin_tecnico() THEN
    v_actor_role := 'admin_tecnico';
  ELSIF private.current_user_is_admin() THEN
    v_actor_role := 'admin_institucional';
  ELSE
    RAISE EXCEPTION 'Ação restrita a administrador institucional ou técnico.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para rejeitar solicitações.'
      USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da rejeição é obrigatório (mínimo 5 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM private.access_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '02000';
  END IF;
  IF v_req.status = 'rejeitada' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status','rejeitada');
  END IF;
  IF v_req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitação em estado % não pode ser rejeitada.', v_req.status
      USING ERRCODE = '22023';
  END IF;
  IF v_req.version <> p_version THEN
    RAISE EXCEPTION 'Solicitação foi modificada por outro processo. Recarregue.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE private.access_requests
     SET status = 'rejeitada',
         version = version + 1,
         decidido_por = v_uid,
         decidido_em = now(),
         motivo_rejeicao = btrim(p_motivo),
         updated_at = now()
   WHERE id = p_request_id;

  UPDATE public.profiles SET status = 'aguardando_dados', updated_at = now()
   WHERE user_id = v_req.user_id;

  PERFORM private.log_audit_event(
    'access_request.reject','access_request', p_request_id::text,
    'sucesso',
    jsonb_build_object('status', jsonb_build_object('from', v_req.status, 'to','rejeitada')),
    jsonb_build_object('motivo', btrim(p_motivo)),
    NULL, v_req.correlation_id, v_actor_role
  );

  RETURN jsonb_build_object('ok', true, 'status','rejeitada');
END;
$$;
REVOKE ALL ON FUNCTION public.rejeitar_solicitacao_acesso(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rejeitar_solicitacao_acesso(uuid, integer, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rejeitar_solicitacao_acesso(uuid, integer, text) TO authenticated;

-- =========================================================
-- Registrar acesso a órgão externo (auditoria de contexto global)
-- =========================================================
CREATE OR REPLACE FUNCTION public.registrar_acesso_orgao_externo(
  p_orgao_id uuid,
  p_modulo text,
  p_finalidade text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'Registro reservado ao Administrador Técnico em acesso global.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.log_audit_event(
    'tecnico.access_org','orgao_execucao', p_orgao_id::text,
    'sucesso', NULL,
    jsonb_build_object('modulo', p_modulo, 'finalidade', p_finalidade),
    p_orgao_id, v_corr, 'admin_tecnico'
  );

  RETURN jsonb_build_object('ok', true, 'correlation_id', v_corr);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_acesso_orgao_externo(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_acesso_orgao_externo(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_acesso_orgao_externo(uuid, text, text) TO authenticated;

-- =========================================================
-- Acesso emergencial (break-glass) — apenas auditoria
-- =========================================================
CREATE OR REPLACE FUNCTION public.registrar_break_glass(
  p_orgao_id uuid,
  p_justificativa text,
  p_chamado text,
  p_prazo_minutos integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'Acesso emergencial restrito ao Administrador Técnico.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para acesso emergencial.' USING ERRCODE = '42501';
  END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) < 20 THEN
    RAISE EXCEPTION 'Justificativa institucional é obrigatória (mínimo 20 caracteres).'
      USING ERRCODE = '22023';
  END IF;
  IF p_chamado IS NULL OR length(btrim(p_chamado)) < 3 THEN
    RAISE EXCEPTION 'Referência de chamado é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_prazo_minutos, 0) NOT BETWEEN 5 AND 240 THEN
    RAISE EXCEPTION 'Prazo do acesso emergencial deve estar entre 5 e 240 minutos.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.log_audit_event(
    'tecnico.break_glass.open','orgao_execucao', COALESCE(p_orgao_id::text,'*'),
    'sucesso', NULL,
    jsonb_build_object(
      'justificativa', btrim(p_justificativa),
      'chamado', btrim(p_chamado),
      'prazo_minutos', p_prazo_minutos,
      'expira_em', (now() + make_interval(mins => p_prazo_minutos))
    ),
    p_orgao_id, v_corr, 'admin_tecnico'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'correlation_id', v_corr,
    'expira_em', (now() + make_interval(mins => p_prazo_minutos))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) TO authenticated;

-- =========================================================
-- Promoção de outro admin_tecnico — dupla checagem + auditoria
-- =========================================================
CREATE OR REPLACE FUNCTION public.promover_admin_tecnico(
  p_target_user_id uuid,
  p_justificativa text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'Somente um Administrador Técnico pode promover outro.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para esta operação.' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'Auto-promoção não é permitida.' USING ERRCODE = '42501';
  END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) < 20 THEN
    RAISE EXCEPTION 'Justificativa institucional é obrigatória (mínimo 20 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_target_user_id) THEN
    RAISE EXCEPTION 'Usuário alvo não possui perfil.' USING ERRCODE = '02000';
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by)
  VALUES (p_target_user_id, 'admin_tecnico', v_uid)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL;

  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = p_target_user_id;

  PERFORM private.log_audit_event(
    'tecnico.promote_admin_tecnico','user_role', p_target_user_id::text,
    'sucesso', NULL,
    jsonb_build_object('justificativa', btrim(p_justificativa)),
    NULL, gen_random_uuid(), 'admin_tecnico'
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.promover_admin_tecnico(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promover_admin_tecnico(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.promover_admin_tecnico(uuid, text) TO authenticated;
