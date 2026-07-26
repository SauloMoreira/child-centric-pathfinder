-- =========================================================================
-- BUG 1: audit inserts com tipo/label inexistentes
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_create_orgao_execucao(p_nome text, p_comarca text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_nome         text := btrim(coalesce(p_nome, ''));
  v_comarca      text := btrim(coalesce(p_comarca, ''));
  v_nome_norm    text;
  v_comarca_norm text;
  v_orgao_id     uuid;
  v_comarca_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(v_nome) < 3    THEN RAISE EXCEPTION 'INVALID_NAME'    USING ERRCODE='22023'; END IF;
  IF length(v_comarca) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_nome_norm    := lower(regexp_replace(v_nome, '\s+', ' ', 'g'));
  v_comarca_norm := private.normalize_comarca_nome(v_comarca);

  SELECT id INTO v_orgao_id
    FROM public.orgaos_execucao
   WHERE nome_normalizado = v_nome_norm AND comarca_normalizada = v_comarca_norm
   LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'DUPLICATE_ORGAO' USING ERRCODE='23505'; END IF;

  INSERT INTO public.orgaos_execucao (nome, comarca, created_by)
  VALUES (v_nome, v_comarca, v_uid) RETURNING id INTO v_orgao_id;

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_comarca, v_comarca_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (v_orgao_id, v_comarca_id, true, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO NOTHING;

  PERFORM private.log_audit_event(
    'orgao.created', 'orgao_execucao', v_orgao_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object('nome', v_nome, 'comarca', v_comarca),
    v_orgao_id, NULL, private.current_user_role()
  );

  RETURN jsonb_build_object('success', true, 'orgao_id', v_orgao_id, 'comarca_id', v_comarca_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_comarca_to_orgao(p_orgao_id uuid, p_comarca_nome text, p_is_principal boolean DEFAULT false, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := btrim(coalesce(p_comarca_nome, ''));
  v_norm text;
  v_comarca_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF length(v_nome) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_norm := private.normalize_comarca_nome(v_nome);

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_nome, v_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  IF p_is_principal THEN
    UPDATE public.orgao_comarcas SET is_principal = false
     WHERE orgao_execucao_id = p_orgao_id AND is_principal = true;
  END IF;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (p_orgao_id, v_comarca_id, p_is_principal, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO UPDATE
    SET is_principal = EXCLUDED.is_principal OR public.orgao_comarcas.is_principal;

  PERFORM private.log_audit_event(
    'orgao.comarca_added', 'orgao_execucao', p_orgao_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object('comarca_id', v_comarca_id, 'is_principal', p_is_principal),
    p_orgao_id, NULL, private.current_user_role()
  );

  RETURN jsonb_build_object('success', true, 'comarca_id', v_comarca_id);
END
$function$;

-- =========================================================================
-- BUG 2: resolução de papel sem checar revoked_at / hierarquia
-- =========================================================================

CREATE OR REPLACE FUNCTION private.user_can_access_org(p_orgao_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_user IS NULL OR p_orgao_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT private.user_is_active(v_user) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id = p_orgao_id) THEN
    RETURN FALSE;
  END IF;

  v_role := private.current_user_role();

  IF v_role = 'admin_tecnico'::public.app_role THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'admin_institucional'::public.app_role THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM private.user_org_memberships m
    WHERE m.user_id = v_user
      AND m.orgao_id = p_orgao_id
      AND m.ativo IS TRUE
      AND m.until IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.user_can_select_org(p_orgao_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_user IS NULL OR p_orgao_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT private.user_is_active(v_user) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id = p_orgao_id) THEN
    RETURN FALSE;
  END IF;

  v_role := private.current_user_role();

  IF v_role = 'admin_tecnico'::public.app_role THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'admin_institucional'::public.app_role THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'defensor_publico'::public.app_role THEN
    RETURN private.user_has_active_org_membership(v_user, p_orgao_id, 'defensor'::private.membership_type_enum);
  END IF;

  IF v_role = 'membro_equipe'::public.app_role THEN
    RETURN private.user_has_active_org_membership(v_user, p_orgao_id, 'membro_equipe'::private.membership_type_enum);
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_defensor_org_membership(p_user_id uuid, p_orgao_id uuid, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_actor_role := private.current_user_role();
  IF v_actor_role NOT IN ('admin_tecnico','admin_institucional') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_actor, 'admin_add_defensor_org_membership', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT role INTO v_target_role
    FROM private.user_roles
   WHERE user_id = p_user_id
     AND revoked_at IS NULL
   ORDER BY CASE role
     WHEN 'admin_tecnico'::public.app_role       THEN 1
     WHEN 'admin_institucional'::public.app_role THEN 2
     WHEN 'defensor_publico'::public.app_role    THEN 3
     WHEN 'membro_equipe'::public.app_role       THEN 4
   END ASC
   LIMIT 1;

  IF v_target_role IS DISTINCT FROM 'defensor_publico' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TARGET_NOT_DEFENDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_FOUND');
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_end_defensor_org_membership(p_membership_id uuid, p_motivo text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_actor_role := private.current_user_role();
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_defensor_memberships(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); END IF;
  v_actor_role := private.current_user_role();
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
$function$;

CREATE OR REPLACE FUNCTION public.selecionar_contexto_orgao(p_orgao_id uuid, p_expected_version bigint DEFAULT NULL::bigint, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_profile_status public.profile_status;
  v_profile_active boolean;
  v_current_orgao uuid;
  v_current_version bigint;
  v_new_version bigint;
  v_orgao_nome text;
  v_correlation uuid := gen_random_uuid();
  v_idem jsonb;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'correlationId', v_correlation);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_idem := private.claim_idempotency(v_user, 'selecionar_contexto_orgao', p_idempotency_key);
    IF v_idem IS NOT NULL AND (v_idem->>'replay')::boolean THEN
      RETURN v_idem->'result';
    END IF;
  END IF;

  SELECT p.status, p.ativo
    INTO v_profile_status, v_profile_active
    FROM public.profiles p
   WHERE p.user_id = v_user;

  IF v_profile_status IS DISTINCT FROM 'ativo'::public.profile_status OR v_profile_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_INACTIVE', 'correlationId', v_correlation);
  END IF;

  v_role := private.current_user_role();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'correlationId', v_correlation);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id = p_orgao_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_FOUND', 'correlationId', v_correlation);
  END IF;

  IF NOT private.user_can_select_org(p_orgao_id) THEN
    PERFORM private.log_audit_event(
      'authorization.context_selection_denied', 'private.user_operational_context',
      v_user::text, 'negado'::public.audit_result, NULL,
      jsonb_build_object('orgao_id', p_orgao_id, 'correlation_id', v_correlation),
      NULL, v_correlation, v_role
    );
    RETURN jsonb_build_object('ok', false, 'code', 'ORGANIZATION_NOT_ACCESSIBLE', 'correlationId', v_correlation);
  END IF;

  SELECT uoc.orgao_id, uoc.version
    INTO v_current_orgao, v_current_version
    FROM private.user_operational_context uoc
   WHERE uoc.user_id = v_user
   FOR UPDATE;

  IF v_current_version IS NOT NULL AND p_expected_version IS NOT NULL
     AND v_current_version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONCURRENT_CHANGE', 'currentVersion', v_current_version, 'correlationId', v_correlation);
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
           updated_at = now(),
           version = version + 1
     WHERE user_id = v_user
     RETURNING version INTO v_new_version;
  END IF;

  SELECT nome INTO v_orgao_nome FROM public.orgaos_execucao WHERE id = p_orgao_id;

  PERFORM private.log_audit_event(
    CASE WHEN v_role = 'admin_tecnico'::public.app_role
         THEN 'admin_technical.operational_context_selected'
         ELSE 'user.operational_context_selected' END,
    'private.user_operational_context',
    v_user::text, 'sucesso'::public.audit_result, NULL,
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
    'acessoGlobal', (v_role = 'admin_tecnico'::public.app_role),
    'correlationId', v_correlation
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM private.complete_idempotency(v_user, 'selecionar_contexto_orgao', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_orgaos_acessiveis(p_termo text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_profile_status public.profile_status;
  v_profile_active boolean;
  v_ctx uuid;
  v_items jsonb := '[]'::jsonb;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_termo text := private.normalize_text(NULLIF(BTRIM(COALESCE(p_termo, '')), ''));
  v_next text;
  v_has_more boolean := false;
  v_correlation uuid := gen_random_uuid();
  v_cursor_key text := NULLIF(split_part(COALESCE(p_cursor, ''), '|', 1), '');
  v_cursor_id text := NULLIF(split_part(COALESCE(p_cursor, ''), '|', 2), '');
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'UNAUTHENTICATED', 'items', '[]'::jsonb,
      'nextCursor', NULL, 'hasMore', false, 'correlationId', v_correlation
    );
  END IF;

  SELECT p.status, p.ativo INTO v_profile_status, v_profile_active
    FROM public.profiles p WHERE p.user_id = v_user;

  IF v_profile_status IS DISTINCT FROM 'ativo'::public.profile_status OR v_profile_active IS DISTINCT FROM TRUE THEN
    PERFORM private.log_audit_event(
      'authorization.organization_listing_denied', 'public.orgaos_execucao', NULL,
      'negado'::public.audit_result, NULL,
      jsonb_build_object('reason', 'PROFILE_INACTIVE', 'correlation_id', v_correlation),
      NULL, v_correlation, NULL
    );
    RETURN jsonb_build_object(
      'ok', false, 'code', 'PROFILE_INACTIVE', 'items', '[]'::jsonb,
      'nextCursor', NULL, 'hasMore', false, 'correlationId', v_correlation
    );
  END IF;

  v_role := private.current_user_role();

  IF v_role IS NULL THEN
    PERFORM private.log_audit_event(
      'authorization.organization_listing_denied', 'public.orgaos_execucao', NULL,
      'negado'::public.audit_result, NULL,
      jsonb_build_object('reason', 'FORBIDDEN', 'correlation_id', v_correlation),
      NULL, v_correlation, NULL
    );
    RETURN jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN', 'items', '[]'::jsonb,
      'nextCursor', NULL, 'hasMore', false, 'correlationId', v_correlation
    );
  END IF;

  v_ctx := private.current_operational_org_id();

  WITH visible AS (
    SELECT
      o.id, o.nome,
      COALESCE(private.normalize_text(o.nome), '') AS sort_key,
      COALESCE(cp.nome, o.comarca) AS comarca_principal,
      COALESCE(ca.comarcas, CASE WHEN o.comarca IS NOT NULL THEN jsonb_build_array(jsonb_build_object('id', NULL, 'nome', o.comarca, 'principal', true)) ELSE '[]'::jsonb END) AS comarcas,
      ca.search_blob,
      NULL::uuid AS membership_id,
      NULL::timestamptz AS since
    FROM public.orgaos_execucao o
    LEFT JOIN LATERAL (
      SELECT c.nome FROM public.orgao_comarcas oc
      JOIN public.comarcas c ON c.id = oc.comarca_id
      WHERE oc.orgao_execucao_id = o.id
      ORDER BY oc.is_principal DESC, c.nome LIMIT 1
    ) cp ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'principal', oc.is_principal) ORDER BY oc.is_principal DESC, c.nome) AS comarcas,
        string_agg(private.normalize_text(c.nome), ' ') AS search_blob
      FROM public.orgao_comarcas oc
      JOIN public.comarcas c ON c.id = oc.comarca_id
      WHERE oc.orgao_execucao_id = o.id
    ) ca ON TRUE
    WHERE v_role IN ('admin_tecnico'::public.app_role, 'admin_institucional'::public.app_role)

    UNION ALL

    SELECT
      o.id, o.nome,
      COALESCE(private.normalize_text(o.nome), '') AS sort_key,
      COALESCE(cp.nome, o.comarca) AS comarca_principal,
      COALESCE(ca.comarcas, CASE WHEN o.comarca IS NOT NULL THEN jsonb_build_array(jsonb_build_object('id', NULL, 'nome', o.comarca, 'principal', true)) ELSE '[]'::jsonb END) AS comarcas,
      ca.search_blob,
      m.id AS membership_id,
      m.since
    FROM private.user_org_memberships m
    JOIN public.orgaos_execucao o ON o.id = m.orgao_id
    LEFT JOIN LATERAL (
      SELECT c.nome FROM public.orgao_comarcas oc
      JOIN public.comarcas c ON c.id = oc.comarca_id
      WHERE oc.orgao_execucao_id = o.id
      ORDER BY oc.is_principal DESC, c.nome LIMIT 1
    ) cp ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'principal', oc.is_principal) ORDER BY oc.is_principal DESC, c.nome) AS comarcas,
        string_agg(private.normalize_text(c.nome), ' ') AS search_blob
      FROM public.orgao_comarcas oc
      JOIN public.comarcas c ON c.id = oc.comarca_id
      WHERE oc.orgao_execucao_id = o.id
    ) ca ON TRUE
    WHERE v_role IN ('defensor_publico'::public.app_role, 'membro_equipe'::public.app_role)
      AND m.user_id = v_user
      AND m.ativo IS TRUE
      AND m.until IS NULL
      AND (
        (v_role = 'defensor_publico'::public.app_role AND m.tipo_vinculo = 'defensor'::private.membership_type_enum)
        OR (v_role = 'membro_equipe'::public.app_role AND m.tipo_vinculo = 'membro_equipe'::private.membership_type_enum)
      )
  ), filtered AS (
    SELECT DISTINCT ON (v.id)
      v.*,
      (v.sort_key || '|' || v.id::text) AS cursor_value
    FROM visible v
    WHERE (
      v_termo IS NULL
      OR private.normalize_text(v.nome) LIKE '%' || v_termo || '%'
      OR private.normalize_text(COALESCE(v.comarca_principal, '')) LIKE '%' || v_termo || '%'
      OR COALESCE(v.search_blob, '') LIKE '%' || v_termo || '%'
    )
      AND (
        p_cursor IS NULL
        OR (v_cursor_key IS NOT NULL AND v_cursor_id IS NOT NULL AND (v.sort_key, v.id::text) > (v_cursor_key, v_cursor_id))
      )
    ORDER BY v.id, v.sort_key, v.nome
  ), page AS (
    SELECT
      f.*,
      row_number() OVER (ORDER BY f.sort_key, f.nome, f.id) AS rn
    FROM filtered f
    ORDER BY f.sort_key, f.nome, f.id
    LIMIT v_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'orgaoId', p.id,
      'nome', p.nome,
      'comarcaPrincipal', p.comarca_principal,
      'comarcas', p.comarcas,
      'membershipId', p.membership_id,
      'dataInicio', p.since,
      'selecionado', (v_ctx = p.id)
    ) ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    MAX(p.cursor_value) FILTER (WHERE p.rn = v_limit + 1),
    EXISTS (SELECT 1 FROM page hp WHERE hp.rn = v_limit + 1)
  INTO v_items, v_next, v_has_more
  FROM page p;

  IF v_role = 'admin_tecnico'::public.app_role AND p_cursor IS NULL THEN
    PERFORM private.log_audit_event(
      'admin_technical.organizations_listed', 'public.orgaos_execucao', NULL,
      'sucesso'::public.audit_result, NULL,
      jsonb_build_object('termo_presente', v_termo IS NOT NULL, 'limit', v_limit, 'correlation_id', v_correlation),
      NULL, v_correlation, v_role
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_items,
    'nextCursor', CASE WHEN v_has_more THEN v_next ELSE NULL END,
    'hasMore', v_has_more,
    'correlationId', v_correlation
  );
END;
$function$;

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
  v_ctx uuid;
  v_ctx_row private.user_operational_context%ROWTYPE;
  v_orgao public.orgaos_execucao%ROWTYPE;
  v_disponiveis jsonb;
  v_comarcas jsonb := '[]'::jsonb;
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

  SELECT * INTO v_ctx_row FROM private.user_operational_context WHERE user_id = v_user;

  IF v_ctx_row.orgao_id IS NOT NULL AND private.user_can_access_org(v_ctx_row.orgao_id) THEN
    v_ctx := v_ctx_row.orgao_id;
    SELECT * INTO v_orgao FROM public.orgaos_execucao WHERE id = v_ctx;
  END IF;

  IF v_ctx IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nome', c.nome,
        'principal', oc.is_principal
      ) ORDER BY oc.is_principal DESC, c.nome), '[]'::jsonb)
      INTO v_comarcas
      FROM public.orgao_comarcas oc
      JOIN public.comarcas c ON c.id = oc.comarca_id
     WHERE oc.orgao_execucao_id = v_ctx;

    IF v_comarcas = '[]'::jsonb AND v_orgao.comarca IS NOT NULL THEN
      v_comarcas := jsonb_build_array(jsonb_build_object('id', NULL, 'nome', v_orgao.comarca, 'principal', true));
    END IF;
  END IF;

  IF v_role = 'admin_tecnico'::public.app_role THEN
    v_disponiveis := NULL;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', o.id,
        'membershipId', m.id,
        'nome', o.nome,
        'comarca', COALESCE(cp.nome, o.comarca),
        'dataInicio', m.since,
        'selecionado', (v_ctx = o.id)
      ) ORDER BY o.nome), '[]'::jsonb)
      INTO v_disponiveis
      FROM private.user_org_memberships m
      JOIN public.orgaos_execucao o ON o.id = m.orgao_id
      LEFT JOIN LATERAL (
        SELECT c.nome
        FROM public.orgao_comarcas oc
        JOIN public.comarcas c ON c.id = oc.comarca_id
        WHERE oc.orgao_execucao_id = o.id
        ORDER BY oc.is_principal DESC, c.nome
        LIMIT 1
      ) cp ON TRUE
     WHERE m.user_id = v_user
       AND m.ativo IS TRUE
       AND m.until IS NULL;
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
    'roles', v_roles,
    'status', v_profile.status,
    'profile', to_jsonb(v_profile),
    'aal2', (v_aal = '"aal2"'),
    'acessoGlobal', (v_role = 'admin_tecnico'::public.app_role),
    'contextoAtual', CASE WHEN v_ctx IS NULL THEN NULL ELSE
      jsonb_build_object(
        'orgaoId', v_ctx,
        'nome', v_orgao.nome,
        'comarca', COALESCE((v_comarcas->0->>'nome'), v_orgao.comarca),
        'comarcas', v_comarcas
      ) END,
    'contextVersion', CASE WHEN v_ctx IS NULL THEN NULL ELSE v_ctx_row.version END,
    'orgaosDisponiveis', v_disponiveis,
    'orgao_ativo', CASE WHEN v_ctx IS NULL THEN NULL ELSE
      jsonb_build_object('id', v_ctx, 'nome', v_orgao.nome, 'comarca', COALESCE((v_comarcas->0->>'nome'), v_orgao.comarca)) END,
    'membership', CASE WHEN v_ctx_row.user_id IS NULL OR v_role = 'admin_tecnico'::public.app_role THEN NULL ELSE
      jsonb_build_object('id', v_ctx_row.user_id, 'dataInicio', v_ctx_row.selected_at, 'status', 'ativo') END,
    'comarcas', v_comarcas,
    'solicitacao_aberta', v_solicitacao,
    'is_admin_tecnico', (v_role = 'admin_tecnico'::public.app_role)
  );
END;
$function$;
