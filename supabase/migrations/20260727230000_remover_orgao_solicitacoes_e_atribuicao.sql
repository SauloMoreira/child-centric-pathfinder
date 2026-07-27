BEGIN;

-- ============================================================
-- Remove dependência de órgão de execução do fluxo de:
--   1) Solicitação de acesso institucional (onboarding)
--   2) Atribuição técnica de papel "Defensor Público"
--   3) Aprovação de solicitação de acesso Membro -> Defensor
--   4) Snapshot de estado institucional (meu_estado_institucional)
--
-- O eixo do sistema é o Defensor Público (ver defensor_context /
-- member_defensor_bonds). Órgão de execução deixou de ser exigido em
-- qualquer etapa de cadastro, aprovação ou atribuição de papel.
-- ============================================================

-- ------------------------------------------------------------
-- 1) private.access_requests: solta a exigência de órgão/proposta
-- ------------------------------------------------------------
ALTER TABLE private.access_requests
  DROP CONSTRAINT IF EXISTS access_requests_orgao_xor_proposta;

COMMENT ON COLUMN private.access_requests.orgao_id IS
  'LEGADO: nao mais coletado no formulario de solicitacao de acesso.';
COMMENT ON COLUMN private.access_requests.proposta_novo_orgao_nome IS
  'LEGADO: nao mais coletado.';
COMMENT ON COLUMN private.access_requests.proposta_novo_orgao_sigla IS
  'LEGADO: nao mais coletado.';
COMMENT ON COLUMN private.access_requests.proposta_novo_orgao_comarca IS
  'LEGADO: nao mais coletado.';
COMMENT ON COLUMN private.access_requests.proposta_novo_orgao_cidade IS
  'LEGADO: nao mais coletado.';
COMMENT ON COLUMN private.access_requests.orgao_final_id IS
  'LEGADO: nao mais atribuido na aprovacao. O papel institucional passa a '
  'ser concedido diretamente, sem vinculo de orgao.';

-- ------------------------------------------------------------
-- 1b) profiles.matricula: a constraint UNIQUE (matricula) é plana e
--     colide com o sentinela "N/D" usado por todo cargo "Membro de
--     equipe" (ver submeter_solicitacao_acesso e o formulário em
--     solicitar-acesso.tsx). Sem esta correção, o segundo membro a se
--     cadastrar sempre falha com duplicate key em profiles_matricula_key.
--     Vira índice único parcial, preservando unicidade real para
--     matrículas de Defensor Público.
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_matricula_key;
DROP INDEX IF EXISTS public.profiles_matricula_key;
CREATE UNIQUE INDEX profiles_matricula_key
  ON public.profiles (matricula)
  WHERE matricula IS NOT NULL AND matricula <> 'N/D';

-- ------------------------------------------------------------
-- 2) submeter_solicitacao_acesso: remove p_orgao_id / p_novo_orgao
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submeter_solicitacao_acesso(text,text,text,text,uuid,jsonb,boolean);

CREATE FUNCTION public.submeter_solicitacao_acesso(
  p_nome_completo   text,
  p_matricula       text,
  p_cargo           text,
  p_telefone        text,
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

  INSERT INTO private.access_requests (
    user_id, nome_completo, matricula, cargo, telefone,
    aceite_termos_at, status, correlation_id
  ) VALUES (
    v_uid, btrim(p_nome_completo), btrim(p_matricula), btrim(p_cargo), NULLIF(btrim(p_telefone),''),
    now(), 'pendente', v_correlation
  )
  RETURNING id INTO v_request_id;

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
    p_metadata       => jsonb_build_object('cargo', btrim(p_cargo)),
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

REVOKE ALL ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.submeter_solicitacao_acesso(text,text,text,text,boolean) TO authenticated;

-- ------------------------------------------------------------
-- 3) listar_solicitacoes_acesso: remove colunas de órgão do retorno
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_solicitacoes_acesso(public.access_request_status,integer);

CREATE FUNCTION public.listar_solicitacoes_acesso(
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
           ar.status, ar.version, ar.correlation_id, ar.created_at
      FROM private.access_requests ar
     WHERE (p_status IS NULL OR ar.status = p_status)
     ORDER BY ar.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.listar_solicitacoes_acesso(public.access_request_status,integer) TO authenticated;

-- ------------------------------------------------------------
-- 4) aprovar_solicitacao_acesso: concede papel pelo cargo declarado,
--    sem criar/selecionar órgão de execução.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aprovar_solicitacao_acesso(uuid,integer,uuid,boolean,jsonb);

CREATE FUNCTION public.aprovar_solicitacao_acesso(
  p_request_id uuid,
  p_version    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
  v_role public.app_role;
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

  v_role := CASE v_req.cargo
    WHEN 'Defensor Público' THEN 'defensor_publico'::public.app_role
    WHEN 'Membro de equipe' THEN 'membro_equipe'::public.app_role
    ELSE NULL
  END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Cargo da solicitação não é reconhecido: %.', v_req.cargo
      USING ERRCODE = '22023';
  END IF;

  -- Atribui papel institucional (idempotente por UNIQUE)
  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (v_req.user_id, v_role, v_uid, v_req.correlation_id)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL;

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
         updated_at = now()
   WHERE id = p_request_id;

  PERFORM private.log_audit_event(
    'access_request.approve','access_request', p_request_id::text,
    'sucesso'::public.audit_result,
    jsonb_build_object('status', jsonb_build_object('from', v_req.status, 'to','aprovada')),
    jsonb_build_object('role', v_role::text),
    NULL, v_req.correlation_id, 'admin_institucional'::public.app_role
  );

  RETURN jsonb_build_object('ok', true, 'status','aprovada', 'role', v_role);
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.aprovar_solicitacao_acesso(uuid,integer) TO authenticated;

-- ------------------------------------------------------------
-- 5) admin_assign_defensor_role: remove p_orgao_execucao_id.
--    Atribuição técnica de Defensor Público passa a ser apenas
--    papel + dados funcionais, sem vínculo de órgão.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_assign_defensor_role(uuid,uuid,text,text,uuid);

CREATE FUNCTION public.admin_assign_defensor_role(
  p_target_user_id uuid,
  p_matricula text DEFAULT NULL::text,
  p_justificativa text DEFAULT NULL::text,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_correlation uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_profile public.profiles%ROWTYPE;
  v_email text;
  v_email_confirmed boolean;
  v_current_role public.app_role;
  v_matricula text;
  v_actor_role public.app_role;
  v_profile_status public.profile_status;
  v_activation_pending boolean;
  v_code text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  IF NOT private.current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Gate MFA: exige AAL2 se o ator já tem fator verificado.
  PERFORM private.require_aal2_if_enrolled(v_actor);

  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_justificativa IS NOT NULL AND char_length(btrim(p_justificativa)) BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_MINIMA_10_CARACTERES' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_email_confirmed
  FROM auth.users u WHERE u.id = p_target_user_id;

  SELECT ur.role INTO v_current_role
  FROM private.user_roles ur
  WHERE ur.user_id = p_target_user_id AND ur.revoked_at IS NULL
  ORDER BY CASE ur.role
    WHEN 'admin_tecnico' THEN 1
    WHEN 'admin_institucional' THEN 2
    WHEN 'defensor_publico' THEN 3
    WHEN 'membro_equipe' THEN 4
  END LIMIT 1;

  IF v_current_role IN ('admin_tecnico','admin_institucional') THEN
    RAISE EXCEPTION 'USER_HAS_INCOMPATIBLE_ROLE' USING ERRCODE = '42501';
  END IF;

  IF v_current_role = 'defensor_publico' THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyApplied', true,
      'code', 'DEFENDER_ROLE_ALREADY_ASSIGNED',
      'targetUserId', p_target_user_id,
      'role', 'defensor_publico',
      'correlationId', v_correlation
    );
  END IF;

  v_matricula := COALESCE(NULLIF(btrim(p_matricula), ''), NULLIF(btrim(v_profile.matricula), ''));
  IF v_matricula IS NULL OR v_matricula = 'N/D' THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:matricula' USING ERRCODE = '22023';
  END IF;

  IF v_profile.nome_completo IS NULL OR char_length(btrim(v_profile.nome_completo)) < 5 THEN
    RAISE EXCEPTION 'TARGET_USER_INCOMPLETE:nome_completo' USING ERRCODE = '22023';
  END IF;

  IF v_current_role = 'membro_equipe' THEN
    UPDATE private.user_roles
       SET revoked_at = now(), revoked_by = v_actor, correlation_id = v_correlation
     WHERE user_id = p_target_user_id AND role = 'membro_equipe' AND revoked_at IS NULL;
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (p_target_user_id, 'defensor_publico'::public.app_role, v_actor, v_correlation)
  ON CONFLICT (user_id, role) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL,
        granted_by = EXCLUDED.granted_by, granted_at = now(),
        correlation_id = EXCLUDED.correlation_id;

  IF v_email_confirmed THEN
    v_profile_status := 'ativo'::public.profile_status;
    v_activation_pending := false;
    v_code := 'DEFENDER_ROLE_ASSIGNED';
  ELSE
    v_profile_status := 'aguardando_aprovacao'::public.profile_status;
    v_activation_pending := true;
    v_code := 'ROLE_ASSIGNED_EMAIL_CONFIRMATION_PENDING';
  END IF;

  PERFORM set_config('reintegra.admin_op','1', true);
  UPDATE public.profiles
     SET matricula = v_matricula,
         cargo = COALESCE(NULLIF(cargo, ''), 'Defensor Público'),
         status = v_profile_status,
         ativo = (v_profile_status = 'ativo'::public.profile_status),
         updated_at = now()
   WHERE user_id = p_target_user_id;
  PERFORM set_config('reintegra.admin_op','0', true);

  SELECT ur.role INTO v_actor_role FROM private.user_roles ur
   WHERE ur.user_id = v_actor AND ur.revoked_at IS NULL LIMIT 1;

  PERFORM private.log_audit_event(
    p_action => 'user.role_assigned',
    p_entity => 'user',
    p_entity_id => p_target_user_id::text,
    p_result => 'sucesso',
    p_changed_fields => jsonb_build_array('role','status','matricula'),
    p_metadata => jsonb_build_object(
      'previous_role', COALESCE(v_current_role::text,'sem_papel'),
      'new_role', 'defensor_publico',
      'profile_status', v_profile_status::text,
      'email_confirmed', v_email_confirmed,
      'justificativa_len', COALESCE(char_length(btrim(p_justificativa)),0)
    ),
    p_correlation_id => v_correlation,
    p_actor_role => v_actor_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'activationPending', v_activation_pending,
    'targetUserId', p_target_user_id,
    'role', 'defensor_publico',
    'profileStatus', v_profile_status::text,
    'correlationId', v_correlation
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assign_defensor_role(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_defensor_role(uuid,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_defensor_role(uuid,text,text,uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6) aprovar_solicitacao_acesso_defensor: corrige bug latente.
--    Ao aprovar solicitação Membro -> Defensor, a função ainda
--    tentava descobrir um órgão para satisfazer uma NOT NULL que
--    já foi removida (ver 20260727222629). Sem órgão configurado,
--    a aprovação falhava com DEFENDER_HAS_NO_ORG. Vínculo passa a
--    ser criado sem órgão, igual a vincular_membro_defensor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_acesso_defensor(
  p_request_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_idem jsonb;
  v_req public.member_defensor_access_requests%ROWTYPE;
  v_bond_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  v_idem := private.claim_idempotency(v_uid, 'member.access_request.approve', p_idempotency_key);
  IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
    RETURN v_idem->'result';
  END IF;

  SELECT * INTO v_req
    FROM public.member_defensor_access_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.defensor_user_id <> v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pendente' THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_NOT_PENDING' USING ERRCODE = '22023';
  END IF;
  IF v_req.optimistic_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE = '40001';
  END IF;

  -- Reconfirmar membro ativo
  IF NOT private.user_is_active_team_member(v_req.member_user_id) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  -- Defensor precisa continuar defensor_publico ativo
  IF NOT EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.revoked_at IS NULL
       AND ur.role = 'defensor_publico'::public.app_role
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Reutiliza vínculo ativo se já existir; senão cria (sem órgão).
  SELECT id INTO v_bond_id
    FROM public.member_defensor_bonds
   WHERE member_user_id = v_req.member_user_id
     AND defensor_user_id = v_uid
     AND status = 'ativo'::public.member_defensor_bond_status
     AND ended_at IS NULL
   LIMIT 1;

  IF v_bond_id IS NULL THEN
    INSERT INTO public.member_defensor_bonds
      (member_user_id, defensor_user_id, status, created_by)
    VALUES
      (v_req.member_user_id, v_uid,
       'ativo'::public.member_defensor_bond_status, v_uid)
    RETURNING id INTO v_bond_id;
  END IF;

  UPDATE public.member_defensor_access_requests
     SET status = 'aprovada',
         reviewed_at = now(),
         reviewed_by = v_uid,
         optimistic_version = optimistic_version + 1
   WHERE id = v_req.id;

  PERFORM private.log_audit_event(
    'member_access.approved', 'member_defensor_access_request', v_req.id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'bond_id', v_bond_id,
      'member_user_id', v_req.member_user_id,
      'defensor_user_id', v_uid
    ),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'ACCESS_REQUEST_APPROVED',
    'requestId', v_req.id,
    'bondId', v_bond_id
  );
  PERFORM private.complete_idempotency(v_uid, 'member.access_request.approve', p_idempotency_key, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso_defensor(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aprovar_solicitacao_acesso_defensor(uuid, bigint, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao_acesso_defensor(uuid, bigint, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 7) meu_estado_institucional: remove todo o bloco de contexto
--    operacional de órgão (contextoAtual, orgaosDisponiveis,
--    orgao_ativo, membership, comarcas). Nada no frontend lê mais
--    esses campos — o seletor de órgão foi removido nesta fase.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_profile public.profiles%ROWTYPE;
  v_solicitacao jsonb;
  v_aal text;
  v_roles jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('user_id', NULL, 'status', NULL, 'papel', NULL, 'acessoGlobal', false);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user;
  v_role := private.current_user_role();

  SELECT COALESCE(jsonb_agg(ur.role ORDER BY CASE ur.role
      WHEN 'admin_tecnico'::public.app_role THEN 1
      WHEN 'admin_institucional'::public.app_role THEN 2
      WHEN 'defensor_publico'::public.app_role THEN 3
      WHEN 'membro_equipe'::public.app_role THEN 4
      ELSE 99 END), '[]'::jsonb)
    INTO v_roles
    FROM private.user_roles ur
   WHERE ur.user_id = v_user
     AND ur.revoked_at IS NULL;

  SELECT COALESCE((auth.jwt() -> 'aal')::text, '"aal1"') INTO v_aal;

  SELECT to_jsonb(s) INTO v_solicitacao
    FROM (
      SELECT id, status, version, created_at
        FROM private.access_requests
       WHERE user_id = v_user AND status IN ('pendente','em_analise')
       ORDER BY created_at DESC LIMIT 1
    ) s;

  RETURN jsonb_build_object(
    'user_id', v_user,
    'papel', v_role,
    'roles', v_roles,
    'status', v_profile.status,
    'profile', to_jsonb(v_profile),
    'aal2', (v_aal = '"aal2"'),
    'acessoGlobal', (v_role = 'admin_tecnico'::public.app_role),
    'solicitacao_aberta', v_solicitacao,
    'is_admin_tecnico', (v_role = 'admin_tecnico'::public.app_role)
  );
END;
$function$;

COMMIT;
