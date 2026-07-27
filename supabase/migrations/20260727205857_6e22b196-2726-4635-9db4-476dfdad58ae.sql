
-- ============================================================
-- Tabela: solicitações de acesso Membro → Defensor
-- ============================================================
CREATE TABLE public.member_defensor_access_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  defensor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovada','rejeitada','cancelada')),
  message text CHECK (message IS NULL OR length(message) <= 300),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  decision_reason text CHECK (decision_reason IS NULL OR length(decision_reason) <= 300),
  optimistic_version bigint NOT NULL DEFAULT 1,
  idempotency_key uuid,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (member_user_id <> defensor_user_id),
  CHECK (
    (status IN ('pendente','cancelada') AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR
    (status IN ('aprovada','rejeitada') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_mdar_one_pending
  ON public.member_defensor_access_requests (member_user_id, defensor_user_id)
  WHERE status = 'pendente';
CREATE UNIQUE INDEX uq_mdar_member_idem
  ON public.member_defensor_access_requests (member_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_mdar_defensor_pending
  ON public.member_defensor_access_requests (defensor_user_id, status);
CREATE INDEX ix_mdar_member
  ON public.member_defensor_access_requests (member_user_id, created_at DESC);

-- Trigger updated_at
CREATE TRIGGER tg_mdar_set_updated_at
  BEFORE UPDATE ON public.member_defensor_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Grants: SELECT apenas via RLS. Escritas exclusivamente via RPCs SECURITY DEFINER.
GRANT SELECT ON public.member_defensor_access_requests TO authenticated;
GRANT ALL ON public.member_defensor_access_requests TO service_role;

ALTER TABLE public.member_defensor_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY mdar_select_self_member
  ON public.member_defensor_access_requests
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

CREATE POLICY mdar_select_target_defender
  ON public.member_defensor_access_requests
  FOR SELECT TO authenticated
  USING (defensor_user_id = auth.uid());

-- ============================================================
-- Helper: detecção heurística de PII em mensagem
-- ============================================================
CREATE OR REPLACE FUNCTION private.mdar_message_looks_personal(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text;
BEGIN
  IF p_text IS NULL THEN RETURN false; END IF;
  v := lower(p_text);
  -- CPF (000.000.000-00 ou 11 dígitos)
  IF v ~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}' THEN RETURN true; END IF;
  -- CNJ processo (20 dígitos com máscara ou não)
  IF v ~ '\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}' THEN RETURN true; END IF;
  -- E-mail
  IF v ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' THEN RETURN true; END IF;
  -- Termos de caso concreto
  IF v ~ '(assistido|acautelado|adolescente|criança|processo\s*n|autos|vara|comarca|nome:|cpf|rg\s*\d)' THEN RETURN true; END IF;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION private.mdar_message_looks_personal(text) FROM PUBLIC;

-- ============================================================
-- RPC: solicitar_acesso_defensor
-- ============================================================
CREATE OR REPLACE FUNCTION public.solicitar_acesso_defensor(
  p_defensor_user_id uuid,
  p_message text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_idem jsonb;
  v_message text;
  v_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF p_defensor_user_id IS NULL THEN
    RAISE EXCEPTION 'DEFENDER_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_defensor_user_id = v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Idempotência
  v_idem := private.claim_idempotency(v_uid, 'member.access_request.create', p_idempotency_key);
  IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
    RETURN v_idem->'result';
  END IF;

  -- Caller precisa ser membro_equipe ativo
  IF NOT private.user_is_active_team_member(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Bloquear se caller possui papel administrativo/defensor
  IF EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.revoked_at IS NULL
       AND ur.role IN (
         'admin_tecnico'::public.app_role,
         'admin_institucional'::public.app_role,
         'defensor_publico'::public.app_role
       )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Defensor precisa existir, ativo, com papel defensor_publico ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.user_id = p_defensor_user_id
       AND pr.status = 'ativo'::public.profile_status
       AND pr.ativo = true
  ) THEN
    RAISE EXCEPTION 'DEFENDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = p_defensor_user_id
       AND ur.revoked_at IS NULL
       AND ur.role = 'defensor_publico'::public.app_role
  ) THEN
    RAISE EXCEPTION 'DEFENDER_INACTIVE' USING ERRCODE = '22023';
  END IF;

  -- Vínculo ativo já existe?
  IF EXISTS (
    SELECT 1 FROM public.member_defensor_bonds b
     WHERE b.member_user_id = v_uid
       AND b.defensor_user_id = p_defensor_user_id
       AND b.status = 'ativo'::public.member_defensor_bond_status
       AND b.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE = '23505';
  END IF;

  -- Solicitação pendente já existe?
  IF EXISTS (
    SELECT 1 FROM public.member_defensor_access_requests r
     WHERE r.member_user_id = v_uid
       AND r.defensor_user_id = p_defensor_user_id
       AND r.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'ACCESS_REQUEST_ALREADY_PENDING' USING ERRCODE = '23505';
  END IF;

  -- Validação da mensagem
  v_message := NULLIF(btrim(COALESCE(p_message, '')), '');
  IF v_message IS NOT NULL AND length(v_message) > 300 THEN
    RAISE EXCEPTION 'MESSAGE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND private.mdar_message_looks_personal(v_message) THEN
    RAISE EXCEPTION 'POSSIBLE_PERSONAL_OR_CASE_DATA' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_defensor_access_requests
    (member_user_id, defensor_user_id, status, message, idempotency_key)
  VALUES
    (v_uid, p_defensor_user_id, 'pendente', v_message, p_idempotency_key)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event(
    'member_access.requested', 'member_defensor_access_request', v_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'defensor_user_id', p_defensor_user_id,
      'member_user_id', v_uid
    ),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'ACCESS_REQUEST_CREATED',
    'requestId', v_id,
    'optimisticVersion', 1
  );
  PERFORM private.complete_idempotency(v_uid, 'member.access_request.create', p_idempotency_key, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.solicitar_acesso_defensor(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solicitar_acesso_defensor(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.solicitar_acesso_defensor(uuid, text, uuid) TO authenticated;

-- ============================================================
-- RPC: listar_solicitacoes_defensor_pendentes
-- Retorna solicitações pendentes destinadas ao Defensor autenticado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_solicitacoes_defensor_pendentes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'createdAt' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'requestId', r.id,
      'memberUserId', r.member_user_id,
      'displayName', COALESCE(pr.nome_completo, 'Membro'),
      'email', COALESCE(u.email, ''),
      'message', r.message,
      'createdAt', r.created_at,
      'optimisticVersion', r.optimistic_version
    ) AS t
    FROM public.member_defensor_access_requests r
    JOIN public.profiles pr ON pr.user_id = r.member_user_id
    LEFT JOIN auth.users u ON u.id = r.member_user_id
    WHERE r.defensor_user_id = v_uid
      AND r.status = 'pendente'
  ) sub;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END $$;

REVOKE ALL ON FUNCTION public.listar_solicitacoes_defensor_pendentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_defensor_pendentes() FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_solicitacoes_defensor_pendentes() TO authenticated;

-- ============================================================
-- RPC: listar_minhas_solicitacoes_defensor
-- Retorna solicitações pendentes que o membro autenticado criou.
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_minhas_solicitacoes_defensor()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'createdAt' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'requestId', r.id,
      'defensorUserId', r.defensor_user_id,
      'defensorName', COALESCE(pr.nome_completo, 'Defensor(a)'),
      'status', r.status,
      'createdAt', r.created_at,
      'reviewedAt', r.reviewed_at
    ) AS t
    FROM public.member_defensor_access_requests r
    LEFT JOIN public.profiles pr ON pr.user_id = r.defensor_user_id
    WHERE r.member_user_id = v_uid
      AND r.status = 'pendente'
  ) sub;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END $$;

REVOKE ALL ON FUNCTION public.listar_minhas_solicitacoes_defensor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_minhas_solicitacoes_defensor() FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_minhas_solicitacoes_defensor() TO authenticated;

-- ============================================================
-- RPC: aprovar_solicitacao_acesso_defensor
-- ============================================================
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
  v_default_org uuid;
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

  -- Reutiliza vínculo ativo se já existir; senão cria.
  SELECT id INTO v_bond_id
    FROM public.member_defensor_bonds
   WHERE member_user_id = v_req.member_user_id
     AND defensor_user_id = v_uid
     AND status = 'ativo'::public.member_defensor_bond_status
     AND ended_at IS NULL
   LIMIT 1;

  IF v_bond_id IS NULL THEN
    -- Descobre um órgão para o vínculo (esquema exige NOT NULL).
    SELECT orgao_id INTO v_default_org
      FROM private.user_operational_context WHERE user_id = v_uid;
    IF v_default_org IS NULL THEN
      SELECT dom.orgao_id INTO v_default_org
        FROM private.defensor_org_memberships dom
       WHERE dom.defensor_user_id = v_uid
         AND dom.status = 'ativo'
       ORDER BY dom.created_at
       LIMIT 1;
    END IF;
    IF v_default_org IS NULL THEN
      RAISE EXCEPTION 'DEFENDER_HAS_NO_ORG' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.member_defensor_bonds
      (member_user_id, defensor_user_id, orgao_id, status, created_by)
    VALUES
      (v_req.member_user_id, v_uid, v_default_org,
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

-- ============================================================
-- RPC: recusar_solicitacao_acesso_defensor
-- ============================================================
CREATE OR REPLACE FUNCTION public.recusar_solicitacao_acesso_defensor(
  p_request_id uuid,
  p_expected_version bigint,
  p_reason text DEFAULT NULL,
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
  v_reason text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  v_idem := private.claim_idempotency(v_uid, 'member.access_request.reject', p_idempotency_key);
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

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NOT NULL AND length(v_reason) > 300 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  UPDATE public.member_defensor_access_requests
     SET status = 'rejeitada',
         reviewed_at = now(),
         reviewed_by = v_uid,
         decision_reason = v_reason,
         optimistic_version = optimistic_version + 1
   WHERE id = v_req.id;

  PERFORM private.log_audit_event(
    'member_access.rejected', 'member_defensor_access_request', v_req.id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'member_user_id', v_req.member_user_id,
      'defensor_user_id', v_uid
    ),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'ACCESS_REQUEST_REJECTED',
    'requestId', v_req.id
  );
  PERFORM private.complete_idempotency(v_uid, 'member.access_request.reject', p_idempotency_key, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.recusar_solicitacao_acesso_defensor(uuid, bigint, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recusar_solicitacao_acesso_defensor(uuid, bigint, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recusar_solicitacao_acesso_defensor(uuid, bigint, text, uuid) TO authenticated;

-- ============================================================
-- RPC: buscar_defensores_para_solicitacao
-- Lista Defensores ativos para o combobox do membro (limite 20).
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_defensores_para_solicitacao(
  p_termo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_termo text;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.user_is_active_team_member(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_termo := NULLIF(btrim(COALESCE(p_termo, '')), '');

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'displayName' ASC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'defensorUserId', pr.user_id,
      'displayName', COALESCE(pr.nome_completo, 'Defensor(a)'),
      'institutionalLabel', pr.cargo,
      'hasActiveBond', EXISTS (
        SELECT 1 FROM public.member_defensor_bonds b
         WHERE b.member_user_id = v_uid
           AND b.defensor_user_id = pr.user_id
           AND b.status = 'ativo'::public.member_defensor_bond_status
           AND b.ended_at IS NULL
      ),
      'hasPendingRequest', EXISTS (
        SELECT 1 FROM public.member_defensor_access_requests r
         WHERE r.member_user_id = v_uid
           AND r.defensor_user_id = pr.user_id
           AND r.status = 'pendente'
      )
    ) AS t
    FROM public.profiles pr
    JOIN private.user_roles ur
      ON ur.user_id = pr.user_id
     AND ur.revoked_at IS NULL
     AND ur.role = 'defensor_publico'::public.app_role
    WHERE pr.status = 'ativo'::public.profile_status
      AND pr.ativo = true
      AND pr.user_id <> v_uid
      AND (
        v_termo IS NULL
        OR pr.nome_completo ILIKE '%' || v_termo || '%'
      )
    ORDER BY pr.nome_completo
    LIMIT 20
  ) sub;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END $$;

REVOKE ALL ON FUNCTION public.buscar_defensores_para_solicitacao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_defensores_para_solicitacao(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.buscar_defensores_para_solicitacao(text) TO authenticated;
