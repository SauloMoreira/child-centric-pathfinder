-- ============================================================
-- PART 2/3: RPCs (context selection, listing, admin memberships, state v2)
-- ============================================================

-- ---------- selecionar_contexto_orgao ----------
CREATE OR REPLACE FUNCTION public.selecionar_contexto_orgao(
  p_orgao_id uuid,
  p_expected_version bigint DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_profile_status public.profile_status;
  v_current_orgao uuid;
  v_current_version bigint;
  v_new_version bigint;
  v_orgao_nome text;
  v_correlation uuid := gen_random_uuid();
  v_idem jsonb;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  -- Idempotência
  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_user, 'selecionar_contexto_orgao', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT status INTO v_profile_status FROM public.profiles WHERE user_id = v_user;
  IF v_profile_status IS NULL OR v_profile_status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_INACTIVE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id = p_orgao_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_FOUND');
  END IF;

  IF NOT private.user_can_select_org(p_orgao_id) THEN
    -- Auditoria de negativa (fora de transação abortada)
    PERFORM private.log_audit_event(
      'authorization.context_selection_denied', 'private.user_operational_context',
      v_user::text, 'negado', NULL,
      jsonb_build_object('orgao_id', p_orgao_id, 'correlation_id', v_correlation),
      NULL, v_correlation
    );
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_ACCESSIBLE');
  END IF;

  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;

  -- Lock contexto atual
  SELECT orgao_id, version INTO v_current_orgao, v_current_version
    FROM private.user_operational_context
   WHERE user_id = v_user
   FOR UPDATE;

  IF v_current_version IS NOT NULL AND p_expected_version IS NOT NULL
     AND v_current_version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONCURRENT_CHANGE',
                              'currentVersion', v_current_version);
  END IF;

  IF v_current_orgao IS NULL THEN
    INSERT INTO private.user_operational_context (user_id, orgao_id, selected_by, version)
    VALUES (v_user, p_orgao_id, v_user, 1);
    v_new_version := 1;
  ELSE
    UPDATE private.user_operational_context
       SET orgao_id = p_orgao_id,
           selected_at = now(),
           selected_by = v_user,
           version = version + 1
     WHERE user_id = v_user
     RETURNING version INTO v_new_version;
  END IF;

  SELECT nome INTO v_orgao_nome FROM public.orgaos_execucao WHERE id = p_orgao_id;

  -- Auditoria
  PERFORM private.log_audit_event(
    CASE WHEN v_role = 'admin_tecnico'
         THEN 'admin_technical.operational_context_selected'
         ELSE 'user.operational_context_selected' END,
    'private.user_operational_context',
    v_user::text, 'sucesso', NULL,
    jsonb_build_object(
      'orgao_anterior', v_current_orgao,
      'orgao_novo', p_orgao_id,
      'version', v_new_version,
      'correlation_id', v_correlation
    ),
    p_orgao_id, v_correlation, v_role
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'OPERATIONAL_CONTEXT_SELECTED',
    'contextoAtual', jsonb_build_object('orgaoId', p_orgao_id, 'nome', v_orgao_nome),
    'version', v_new_version,
    'correlationId', v_correlation
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM private.complete_idempotency(v_user, 'selecionar_contexto_orgao', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.selecionar_contexto_orgao(uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.selecionar_contexto_orgao(uuid, bigint, uuid) TO authenticated;

-- ---------- listar_orgaos_acessiveis ----------
CREATE OR REPLACE FUNCTION public.listar_orgaos_acessiveis(
  p_termo text DEFAULT NULL,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_ctx uuid;
  v_items jsonb;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_termo text := NULLIF(BTRIM(COALESCE(p_termo, '')), '');
  v_next uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'nextCursor', NULL);
  END IF;

  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;
  v_ctx := private.current_operational_org_id();

  IF v_role IN ('admin_tecnico','admin_institucional') THEN
    -- Todos os órgãos, paginados por nome/id
    WITH base AS (
      SELECT o.id, o.nome, o.comarca
        FROM public.orgaos_execucao o
       WHERE (v_termo IS NULL
              OR o.nome_normalizado ILIKE '%' || private.normalize_text(v_termo) || '%'
              OR o.comarca_normalizada ILIKE '%' || private.normalize_text(v_termo) || '%')
       ORDER BY o.nome, o.id
    ), page AS (
      SELECT * FROM base
       WHERE p_cursor IS NULL OR id > p_cursor
       ORDER BY nome, id
       LIMIT v_limit + 1
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', p.id,
        'nome', p.nome,
        'comarcas', jsonb_build_array(jsonb_build_object('nome', p.comarca, 'principal', true)),
        'membershipId', NULL,
        'selecionado', (v_ctx = p.id)
      ) ORDER BY p.nome), '[]'::jsonb) INTO v_items
      FROM (SELECT * FROM page LIMIT v_limit) p;

    SELECT id INTO v_next FROM page OFFSET v_limit LIMIT 1;
  ELSE
    -- Somente vínculos ativos do usuário
    WITH base AS (
      SELECT o.id, o.nome, o.comarca, m.id AS membership_id, m.since
        FROM private.user_org_memberships m
        JOIN public.orgaos_execucao o ON o.id = m.orgao_id
       WHERE m.user_id = v_user
         AND m.ativo IS TRUE
         AND m.until IS NULL
         AND (v_termo IS NULL
              OR o.nome_normalizado ILIKE '%' || private.normalize_text(v_termo) || '%'
              OR o.comarca_normalizada ILIKE '%' || private.normalize_text(v_termo) || '%')
       ORDER BY o.nome, o.id
    ), page AS (
      SELECT * FROM base
       WHERE p_cursor IS NULL OR id > p_cursor
       ORDER BY nome, id
       LIMIT v_limit + 1
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', p.id,
        'nome', p.nome,
        'comarcas', jsonb_build_array(jsonb_build_object('nome', p.comarca, 'principal', true)),
        'membershipId', p.membership_id,
        'dataInicio', p.since,
        'selecionado', (v_ctx = p.id)
      ) ORDER BY p.nome), '[]'::jsonb) INTO v_items
      FROM (SELECT * FROM page LIMIT v_limit) p;

    SELECT id INTO v_next FROM page OFFSET v_limit LIMIT 1;
  END IF;

  RETURN jsonb_build_object('items', v_items, 'nextCursor', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_orgaos_acessiveis(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_orgaos_acessiveis(text, uuid, integer) TO authenticated;

-- ---------- admin_add_defensor_org_membership ----------
CREATE OR REPLACE FUNCTION public.admin_add_defensor_org_membership(
  p_user_id uuid,
  p_orgao_id uuid,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role public.app_role;
  v_membership_id uuid;
  v_correlation uuid := gen_random_uuid();
  v_idem jsonb;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT role INTO v_actor_role FROM private.user_roles WHERE user_id = v_actor LIMIT 1;
  IF v_actor_role NOT IN ('admin_tecnico','admin_institucional') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_actor, 'admin_add_defensor_org_membership', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT role INTO v_target_role FROM private.user_roles WHERE user_id = p_user_id LIMIT 1;
  IF v_target_role IS DISTINCT FROM 'defensor_publico' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TARGET_NOT_DEFENDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_FOUND');
  END IF;

  -- Se já existir vínculo ativo, é replay idempotente
  SELECT id INTO v_membership_id
    FROM private.user_org_memberships
   WHERE user_id = p_user_id AND orgao_id = p_orgao_id
     AND tipo_vinculo = 'defensor' AND ativo IS TRUE AND until IS NULL
   LIMIT 1;

  IF v_membership_id IS NULL THEN
    INSERT INTO private.user_org_memberships (
      user_id, orgao_id, ativo, since, granted_by, correlation_id, tipo_vinculo
    ) VALUES (
      p_user_id, p_orgao_id, TRUE, now(), v_actor, v_correlation, 'defensor'
    )
    RETURNING id INTO v_membership_id;
  END IF;

  PERFORM private.log_audit_event(
    'defender.membership_created', 'private.user_org_memberships',
    v_membership_id::text, 'sucesso', NULL,
    jsonb_build_object('user_id', p_user_id, 'orgao_id', p_orgao_id, 'correlation_id', v_correlation),
    p_orgao_id, v_correlation, v_actor_role
  );

  v_result := jsonb_build_object(
    'ok', true, 'code', 'DEFENDER_MEMBERSHIP_CREATED',
    'membershipId', v_membership_id, 'correlationId', v_correlation
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM private.complete_idempotency(v_actor, 'admin_add_defensor_org_membership', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_defensor_org_membership(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_defensor_org_membership(uuid, uuid, uuid) TO authenticated;

-- ---------- admin_end_defensor_org_membership ----------
CREATE OR REPLACE FUNCTION public.admin_end_defensor_org_membership(
  p_membership_id uuid,
  p_motivo text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_row private.user_org_memberships%ROWTYPE;
  v_correlation uuid := gen_random_uuid();
  v_restantes int;
  v_um_restante_orgao uuid;
  v_idem jsonb;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT role INTO v_actor_role FROM private.user_roles WHERE user_id = v_actor LIMIT 1;
  IF v_actor_role NOT IN ('admin_tecnico','admin_institucional') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_actor, 'admin_end_defensor_org_membership', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT * INTO v_row FROM private.user_org_memberships WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MEMBERSHIP_NOT_FOUND');
  END IF;
  IF v_row.ativo IS FALSE OR v_row.until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ENDED', 'membershipId', v_row.id);
  END IF;
  IF v_row.tipo_vinculo <> 'defensor' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DEFENDER_MEMBERSHIP');
  END IF;

  UPDATE private.user_org_memberships
     SET ativo = FALSE, until = now(),
         ended_by = v_actor,
         motivo_encerramento = p_motivo,
         correlation_id = v_correlation
   WHERE id = p_membership_id;

  -- Ajustar contexto operacional, se este era o vínculo em uso
  IF EXISTS (SELECT 1 FROM private.user_operational_context
              WHERE user_id = v_row.user_id AND orgao_id = v_row.orgao_id) THEN
    SELECT COUNT(*), MAX(orgao_id)
      INTO v_restantes, v_um_restante_orgao
      FROM private.user_org_memberships
     WHERE user_id = v_row.user_id AND ativo IS TRUE AND until IS NULL
       AND tipo_vinculo = 'defensor';

    IF v_restantes = 1 THEN
      UPDATE private.user_operational_context
         SET orgao_id = v_um_restante_orgao,
             selected_at = now(), selected_by = v_actor, version = version + 1
       WHERE user_id = v_row.user_id;
    ELSE
      DELETE FROM private.user_operational_context WHERE user_id = v_row.user_id;
    END IF;
  END IF;

  PERFORM private.log_audit_event(
    'defender.membership_ended', 'private.user_org_memberships',
    v_row.id::text, 'sucesso', NULL,
    jsonb_build_object(
      'user_id', v_row.user_id, 'orgao_id', v_row.orgao_id,
      'motivo', p_motivo, 'correlation_id', v_correlation
    ),
    v_row.orgao_id, v_correlation, v_actor_role
  );

  v_result := jsonb_build_object(
    'ok', true, 'code', 'DEFENDER_MEMBERSHIP_ENDED',
    'membershipId', v_row.id, 'correlationId', v_correlation
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM private.complete_idempotency(v_actor, 'admin_end_defensor_org_membership', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_end_defensor_org_membership(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_defensor_org_membership(uuid, text, uuid) TO authenticated;

-- ---------- admin_list_defensor_memberships ----------
CREATE OR REPLACE FUNCTION public.admin_list_defensor_memberships(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); END IF;
  SELECT role INTO v_actor_role FROM private.user_roles WHERE user_id = v_actor LIMIT 1;
  IF v_actor_role NOT IN ('admin_tecnico','admin_institucional') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'membershipId', m.id,
      'orgaoId', m.orgao_id,
      'orgaoNome', o.nome,
      'orgaoComarca', o.comarca,
      'ativo', m.ativo,
      'since', m.since,
      'until', m.until,
      'tipoVinculo', m.tipo_vinculo
    ) ORDER BY m.since DESC), '[]'::jsonb) INTO v_items
    FROM private.user_org_memberships m
    JOIN public.orgaos_execucao o ON o.id = m.orgao_id
   WHERE m.user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_defensor_memberships(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_defensor_memberships(uuid) TO authenticated;

-- ---------- meu_estado_institucional v2 ----------
CREATE OR REPLACE FUNCTION public.meu_estado_institucional()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_profile public.profiles%ROWTYPE;
  v_ctx uuid;
  v_ctx_row private.user_operational_context%ROWTYPE;
  v_orgao public.orgaos_execucao%ROWTYPE;
  v_disponiveis jsonb;
  v_comarcas jsonb;
  v_solicitacao jsonb;
  v_aal text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('user_id', NULL);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user;
  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;

  SELECT COALESCE((auth.jwt() -> 'aal')::text, '"aal1"') INTO v_aal;

  SELECT * INTO v_ctx_row FROM private.user_operational_context WHERE user_id = v_user;
  IF v_ctx_row.orgao_id IS NOT NULL AND private.user_can_access_org(v_ctx_row.orgao_id) THEN
    v_ctx := v_ctx_row.orgao_id;
    SELECT * INTO v_orgao FROM public.orgaos_execucao WHERE id = v_ctx;
  END IF;

  -- comarcas do órgão atual (via orgao_comarcas)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'principal', oc.is_principal
    ) ORDER BY oc.is_principal DESC, c.nome), '[]'::jsonb) INTO v_comarcas
    FROM public.orgao_comarcas oc
    JOIN public.comarcas c ON c.id = oc.comarca_id
   WHERE oc.orgao_execucao_id = v_ctx;

  -- Órgãos disponíveis
  IF v_role = 'admin_tecnico' THEN
    v_disponiveis := NULL;  -- consultado via listar_orgaos_acessiveis (paginado)
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', o.id,
        'membershipId', m.id,
        'nome', o.nome,
        'comarca', o.comarca,
        'dataInicio', m.since,
        'selecionado', (v_ctx = o.id)
      ) ORDER BY o.nome), '[]'::jsonb) INTO v_disponiveis
      FROM private.user_org_memberships m
      JOIN public.orgaos_execucao o ON o.id = m.orgao_id
     WHERE m.user_id = v_user AND m.ativo IS TRUE AND m.until IS NULL;
  END IF;

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
    'roles', COALESCE((SELECT jsonb_agg(role) FROM private.user_roles WHERE user_id = v_user), '[]'::jsonb),
    'status', v_profile.status,
    'profile', to_jsonb(v_profile),
    'aal2', (v_aal = '"aal2"'),
    'acessoGlobal', (v_role = 'admin_tecnico'),
    'contextoAtual', CASE WHEN v_ctx IS NULL THEN NULL ELSE
      jsonb_build_object(
        'orgaoId', v_ctx,
        'nome', v_orgao.nome,
        'comarca', v_orgao.comarca,
        'comarcas', v_comarcas
      ) END,
    'contextVersion', v_ctx_row.version,
    'orgaosDisponiveis', v_disponiveis,
    -- compat legado
    'orgao_ativo', CASE WHEN v_ctx IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_ctx, 'nome', v_orgao.nome, 'comarca', v_orgao.comarca) END,
    'membership', CASE WHEN v_ctx_row.user_id IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_ctx_row.user_id, 'dataInicio', v_ctx_row.selected_at, 'status', 'ativo') END,
    'comarcas', v_comarcas,
    'solicitacao_aberta', v_solicitacao,
    'is_admin_tecnico', (v_role = 'admin_tecnico')
  );
END;
$$;

-- ---------- defensor_alterar_orgao_ativo → wrapper não destrutivo ----------
CREATE OR REPLACE FUNCTION public.defensor_alterar_orgao_ativo(
  p_new_orgao_id uuid,
  p_expected_current_membership_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.selecionar_contexto_orgao(p_new_orgao_id, NULL, NULL);
$$;
