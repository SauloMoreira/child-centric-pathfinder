-- =========================================================
-- 0009_rpc_administrative_actions.sql
-- RPCs administrativas transacionais e auditadas
-- =========================================================

-- =========================================================
-- submeter_solicitacao_acesso
-- =========================================================
CREATE OR REPLACE FUNCTION public.submeter_solicitacao_acesso(
  p_nome_completo   text,
  p_matricula       text,
  p_cargo           text,
  p_telefone        text,
  p_orgao_id        uuid,
  p_novo_orgao      jsonb, -- { nome, sigla, comarca, cidade } ou NULL
  p_aceite_termos   boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request_id uuid;
  v_correlation uuid := gen_random_uuid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF p_aceite_termos IS NOT TRUE THEN
    RAISE EXCEPTION 'É necessário aceitar os termos institucionais.'
      USING ERRCODE = '22023';
  END IF;

  IF p_nome_completo IS NULL OR length(btrim(p_nome_completo)) < 3 THEN
    RAISE EXCEPTION 'Nome completo é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_matricula IS NULL OR length(btrim(p_matricula)) < 2 THEN
    RAISE EXCEPTION 'Matrícula é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF p_cargo IS NULL OR length(btrim(p_cargo)) < 2 THEN
    RAISE EXCEPTION 'Cargo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF (p_orgao_id IS NULL AND p_novo_orgao IS NULL)
     OR (p_orgao_id IS NOT NULL AND p_novo_orgao IS NOT NULL) THEN
    RAISE EXCEPTION 'Informe um órgão existente OU uma proposta de novo órgão.'
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_orgao IS NOT NULL THEN
    IF COALESCE(btrim(p_novo_orgao->>'nome'), '') = ''
       OR COALESCE(btrim(p_novo_orgao->>'sigla'), '') = '' THEN
      RAISE EXCEPTION 'Proposta de novo órgão exige nome e sigla.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Verifica se já existe solicitação aberta
  IF EXISTS (
    SELECT 1 FROM private.access_requests
    WHERE user_id = v_uid AND status IN ('pendente','em_analise')
  ) THEN
    RAISE EXCEPTION 'Já existe solicitação de acesso em andamento.'
      USING ERRCODE = '23505';
  END IF;

  -- Trava e valida perfil
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = '02000';
  END IF;

  IF v_profile.status NOT IN ('aguardando_dados','aguardando_aprovacao') THEN
    RAISE EXCEPTION 'Perfil já processado. Situação atual: %.', v_profile.status
      USING ERRCODE = '22023';
  END IF;

  -- Insere solicitação
  INSERT INTO private.access_requests (
    user_id, nome_completo, matricula, cargo, telefone,
    orgao_id,
    proposta_novo_orgao_nome, proposta_novo_orgao_sigla,
    proposta_novo_orgao_comarca, proposta_novo_orgao_cidade,
    aceite_termos_at, status, correlation_id
  ) VALUES (
    v_uid, btrim(p_nome_completo), btrim(p_matricula), btrim(p_cargo), NULLIF(btrim(p_telefone),''),
    p_orgao_id,
    NULLIF(btrim(p_novo_orgao->>'nome'), ''),
    NULLIF(btrim(p_novo_orgao->>'sigla'), ''),
    NULLIF(btrim(p_novo_orgao->>'comarca'), ''),
    NULLIF(btrim(p_novo_orgao->>'cidade'), ''),
    now(), 'pendente', v_correlation
  )
  RETURNING id INTO v_request_id;

  -- Atualiza perfil como aguardando aprovação e sincroniza dados cadastrais
  UPDATE public.profiles
     SET nome_completo = btrim(p_nome_completo),
         matricula     = btrim(p_matricula),
         cargo         = btrim(p_cargo),
         telefone      = NULLIF(btrim(p_telefone),''),
         status        = 'aguardando_aprovacao',
         updated_at    = now()
   WHERE user_id = v_uid;

  PERFORM private.log_audit_event(
    p_action         => 'access_request.submit',
    p_entity         => 'access_request',
    p_entity_id      => v_request_id::text,
    p_result         => 'sucesso',
    p_metadata       => jsonb_build_object('orgao_id', p_orgao_id, 'proposta', p_novo_orgao IS NOT NULL),
    p_correlation_id => v_correlation
  );

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'correlation_id', v_correlation,
    'status', 'pendente'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,uuid,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,uuid,jsonb,boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,uuid,jsonb,boolean) TO authenticated;

-- =========================================================
-- cancelar_solicitacao_acesso
-- =========================================================
CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_acesso(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM private.access_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '02000';
  END IF;

  IF v_req.user_id <> v_uid THEN
    RAISE EXCEPTION 'Você não pode cancelar solicitação de outro usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitação não pode mais ser cancelada.' USING ERRCODE = '22023';
  END IF;

  UPDATE private.access_requests
     SET status = 'cancelada', version = version + 1, updated_at = now()
   WHERE id = p_request_id;

  UPDATE public.profiles
     SET status = 'aguardando_dados', updated_at = now()
   WHERE user_id = v_uid;

  PERFORM private.log_audit_event(
    'access_request.cancel','access_request', p_request_id::text,
    'sucesso', NULL, NULL, NULL, v_req.correlation_id
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_solicitacao_acesso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_solicitacao_acesso(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancelar_solicitacao_acesso(uuid) TO authenticated;

-- =========================================================
-- listar_solicitacoes_acesso (admin)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores institucionais podem listar solicitações.'
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

REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) TO authenticated;

-- =========================================================
-- aprovar_solicitacao_acesso (admin, exige MFA)
-- =========================================================
CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_acesso(
  p_request_id     uuid,
  p_version        integer,
  p_orgao_final_id uuid,            -- se aprovar como órgão existente
  p_criar_novo     boolean DEFAULT false,
  p_novo_orgao     jsonb   DEFAULT NULL  -- { nome, sigla, comarca, cidade, uf }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
  v_orgao_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'Ação restrita ao administrador institucional.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para aprovar solicitações.'
      USING ERRCODE = '42501';
  END IF;

  -- Trava a solicitação
  SELECT * INTO v_req FROM private.access_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '02000';
  END IF;

  -- Idempotência: se já aprovada com o mesmo destino, retorna ok
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

  -- Determina órgão final
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

  -- Atribui papel operacional (idempotente por UNIQUE)
  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (v_req.user_id, 'defensor_publico', v_uid, v_req.correlation_id)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL;

  -- Encerra vínculos anteriores ativos e cria o novo
  UPDATE private.user_org_memberships
     SET ativo = false, until = now(), ended_by = v_uid,
         motivo_encerramento = 'substituido_por_nova_aprovacao'
   WHERE user_id = v_req.user_id AND ativo = true;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by, correlation_id)
  VALUES (v_req.user_id, v_orgao_id, v_uid, v_req.correlation_id);

  -- Ativa perfil
  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = v_req.user_id;

  -- Conclui solicitação
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
    v_orgao_id, v_req.correlation_id, 'admin_institucional'
  );

  RETURN jsonb_build_object('ok', true, 'status','aprovada', 'orgao_id', v_orgao_id);
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer,uuid,boolean,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer,uuid,boolean,jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer,uuid,boolean,jsonb) TO authenticated;

-- =========================================================
-- rejeitar_solicitacao_acesso (admin, exige MFA)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rejeitar_solicitacao_acesso(
  p_request_id uuid,
  p_version    integer,
  p_motivo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'Ação restrita ao administrador institucional.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para rejeitar solicitações.'
      USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da rejeição é obrigatório (mínimo 5 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM private.access_requests
   WHERE id = p_request_id FOR UPDATE;

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

  UPDATE public.profiles
     SET status = 'aguardando_dados', updated_at = now()
   WHERE user_id = v_req.user_id;

  PERFORM private.log_audit_event(
    'access_request.reject','access_request', p_request_id::text,
    'sucesso',
    jsonb_build_object('status', jsonb_build_object('from', v_req.status, 'to','rejeitada')),
    jsonb_build_object('motivo', btrim(p_motivo)),
    NULL, v_req.correlation_id, 'admin_institucional'
  );

  RETURN jsonb_build_object('ok', true, 'status','rejeitada');
END;
$$;

REVOKE ALL ON FUNCTION public.rejeitar_solicitacao_acesso(uuid,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rejeitar_solicitacao_acesso(uuid,integer,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rejeitar_solicitacao_acesso(uuid,integer,text) TO authenticated;

-- =========================================================
-- meu_estado_institucional
-- =========================================================
-- Retorna, para o usuário autenticado, um snapshot consolidado:
--  { profile, roles[], orgao_ativo, solicitacao_aberta }
CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
      SELECT jsonb_build_object('id', oe.id, 'nome', oe.nome, 'sigla', oe.sigla)
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
$$;

REVOKE ALL ON FUNCTION public.meu_estado_institucional() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.meu_estado_institucional() FROM anon;
GRANT  EXECUTE ON FUNCTION public.meu_estado_institucional() TO authenticated;