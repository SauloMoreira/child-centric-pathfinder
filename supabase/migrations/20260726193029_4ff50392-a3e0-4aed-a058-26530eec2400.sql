
-- ============================================================
-- Utilitário: valida CPF (11 dígitos + verificadores)
-- ============================================================
CREATE OR REPLACE FUNCTION private.is_valid_cpf(p_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE d int[]; s int; r int; i int;
BEGIN
  IF p_cpf IS NULL OR p_cpf !~ '^\d{11}$' THEN RETURN false; END IF;
  IF p_cpf ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  d := ARRAY(SELECT substring(p_cpf,i,1)::int FROM generate_series(1,11) i);
  s := 0; FOR i IN 1..9 LOOP s := s + d[i]*(11-i); END LOOP;
  r := s * 10 % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> d[10] THEN RETURN false; END IF;
  s := 0; FOR i IN 1..10 LOOP s := s + d[i]*(12-i); END LOOP;
  r := s * 10 % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = d[11];
END $$;
REVOKE ALL ON FUNCTION private.is_valid_cpf(text) FROM PUBLIC;

-- ============================================================
-- Utilitário: resolver órgão do executor
-- ============================================================
CREATE OR REPLACE FUNCTION private.resolve_target_org(p_orgao_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  IF private.is_admin_tecnico() THEN
    IF p_orgao_id IS NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_REQUIRED_FOR_TECHNICAL_ADMIN' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
      RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='02000';
    END IF;
    RETURN p_orgao_id;
  END IF;
  v_org := private.current_active_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION private.resolve_target_org(uuid) FROM PUBLIC;

-- ============================================================
-- RPC: cadastrar criança/adolescente
-- ============================================================
CREATE OR REPLACE FUNCTION public.cadastrar_assistido_crianca(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_prenome text; v_sobrenome text; v_dob date;
  v_sexo public.sexo_registral_enum;
  v_genero text; v_cpf text;
  v_nome_mae text; v_nome_pai text;
  v_override text;
  v_dup jsonb;
  v_id uuid;
  v_fam jsonb; v_irm jsonb;
  v_actor_role public.app_role;
  v_correlation uuid := gen_random_uuid();
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_org := private.resolve_target_org(NULLIF(p_payload->>'orgaoId','')::uuid);

  v_prenome   := regexp_replace(btrim(coalesce(p_payload->>'prenome','')), '\s+', ' ', 'g');
  v_sobrenome := regexp_replace(btrim(coalesce(p_payload->>'sobrenome','')), '\s+', ' ', 'g');
  v_dob       := NULLIF(p_payload->>'dataNascimento','')::date;
  v_sexo      := COALESCE(NULLIF(p_payload->>'sexoRegistral','')::public.sexo_registral_enum,'nao_informado');
  v_genero    := NULLIF(btrim(coalesce(p_payload->>'genero','')),'');
  v_cpf       := NULLIF(regexp_replace(coalesce(p_payload->>'cpf',''), '\D','','g'),'');
  v_nome_mae  := regexp_replace(btrim(coalesce(p_payload->>'nomeMae','')), '\s+', ' ', 'g');
  v_nome_pai  := NULLIF(regexp_replace(btrim(coalesce(p_payload->>'nomePai','')), '\s+', ' ', 'g'),'');
  v_override  := NULLIF(btrim(coalesce(p_payload->>'duplicateOverrideReason','')),'');

  IF length(v_prenome) < 2 OR length(v_prenome) > 100 THEN
    RAISE EXCEPTION 'INVALID_PRENOME' USING ERRCODE='22023';
  END IF;
  IF length(v_sobrenome) < 2 OR length(v_sobrenome) > 150 THEN
    RAISE EXCEPTION 'INVALID_SOBRENOME' USING ERRCODE='22023';
  END IF;
  IF v_dob IS NULL OR v_dob > current_date THEN
    RAISE EXCEPTION 'INVALID_BIRTHDATE' USING ERRCODE='22023';
  END IF;
  IF EXTRACT(YEAR FROM age(current_date, v_dob))::int >= 18 THEN
    RAISE EXCEPTION 'AGE_NOT_MINOR' USING ERRCODE='22023';
  END IF;
  IF length(v_nome_mae) < 5 OR length(v_nome_mae) > 200 THEN
    RAISE EXCEPTION 'INVALID_NOME_MAE' USING ERRCODE='22023';
  END IF;
  IF v_cpf IS NOT NULL AND NOT private.is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'INVALID_CPF' USING ERRCODE='22023';
  END IF;

  -- CPF já existe
  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.assistidos
      WHERE cpf = v_cpf AND deleted_at IS NULL LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code','CPF_ALREADY_EXISTS','existingAssistidoId', v_existing_id);
    END IF;
  END IF;

  -- Duplicidade sem CPF
  IF v_cpf IS NULL AND v_override IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome_completo, 'data_nascimento', a.data_nascimento,
      'categoria', a.categoria)), '[]'::jsonb)
      INTO v_dup
      FROM public.assistidos a
     WHERE a.deleted_at IS NULL
       AND a.orgao_execucao_id = v_org
       AND a.data_nascimento = v_dob
       AND private.normalize_search_text(a.nome_completo)
           = private.normalize_search_text(v_prenome || ' ' || v_sobrenome)
       AND (a.nome_mae IS NULL OR
            private.normalize_search_text(a.nome_mae) = private.normalize_search_text(v_nome_mae));
    IF v_dup <> '[]'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'code','POSSIBLE_DUPLICATE_ASSISTIDO','candidates', v_dup);
    END IF;
  END IF;

  INSERT INTO public.assistidos (
    prenome, sobrenome, nome_completo, data_nascimento, sexo_registral, genero,
    cpf, nome_mae, nome_pai, categoria, orgao_execucao_id, created_by, updated_by
  ) VALUES (
    v_prenome, v_sobrenome, v_prenome || ' ' || v_sobrenome, v_dob, v_sexo, v_genero,
    v_cpf, v_nome_mae, v_nome_pai, 'crianca_adolescente', v_org, v_uid, v_uid
  ) RETURNING id INTO v_id;

  -- Vínculos familiares (destino = adulto)
  v_fam := COALESCE(p_payload->'familiares','[]'::jsonb);
  IF jsonb_typeof(v_fam) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org, v_id, (f->>'assistidoId')::uuid, (f->>'tipo')::public.vinculo_enum, v_uid
      FROM jsonb_array_elements(v_fam) f
     WHERE (f->>'assistidoId') IS NOT NULL AND (f->>'tipo') IS NOT NULL;
  END IF;

  -- Irmãos
  v_irm := COALESCE(p_payload->'irmaos','[]'::jsonb);
  IF jsonb_typeof(v_irm) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org,
           LEAST(v_id, (i)::uuid),
           GREATEST(v_id, (i)::uuid),
           'irmao', v_uid
      FROM jsonb_array_elements_text(v_irm) i
     WHERE i IS NOT NULL AND i <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  v_actor_role := CASE WHEN private.is_admin_tecnico() THEN 'admin_tecnico'
                       WHEN private.current_user_is_admin() THEN 'admin_institucional'
                       ELSE 'defensor_publico' END;
  PERFORM private.log_audit_event('assistido.child_created','assistido', v_id::text,
    'sucesso', NULL,
    jsonb_build_object('override_dup', v_override IS NOT NULL, 'tem_cpf', v_cpf IS NOT NULL),
    v_org, v_correlation, v_actor_role);

  RETURN jsonb_build_object('ok', true, 'code','ASSISTIDO_CREATED',
    'id', v_id, 'categoria','crianca_adolescente', 'correlationId', v_correlation);
END $$;

REVOKE ALL ON FUNCTION public.cadastrar_assistido_crianca(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_assistido_crianca(jsonb) TO authenticated;

-- ============================================================
-- RPC: cadastrar adulto
-- ============================================================
CREATE OR REPLACE FUNCTION public.cadastrar_assistido_adulto(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_prenome text; v_sobrenome text; v_dob date;
  v_sexo public.sexo_registral_enum;
  v_genero text; v_cpf text;
  v_nome_mae text; v_nome_pai text;
  v_override text;
  v_dup jsonb;
  v_id uuid;
  v_criancas jsonb;
  v_actor_role public.app_role;
  v_correlation uuid := gen_random_uuid();
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_org := private.resolve_target_org(NULLIF(p_payload->>'orgaoId','')::uuid);

  v_prenome   := regexp_replace(btrim(coalesce(p_payload->>'prenome','')), '\s+', ' ', 'g');
  v_sobrenome := regexp_replace(btrim(coalesce(p_payload->>'sobrenome','')), '\s+', ' ', 'g');
  v_dob       := NULLIF(p_payload->>'dataNascimento','')::date;
  v_sexo      := COALESCE(NULLIF(p_payload->>'sexoRegistral','')::public.sexo_registral_enum,'nao_informado');
  v_genero    := NULLIF(btrim(coalesce(p_payload->>'genero','')),'');
  v_cpf       := NULLIF(regexp_replace(coalesce(p_payload->>'cpf',''), '\D','','g'),'');
  v_nome_mae  := NULLIF(regexp_replace(btrim(coalesce(p_payload->>'nomeMae','')), '\s+', ' ', 'g'),'');
  v_nome_pai  := NULLIF(regexp_replace(btrim(coalesce(p_payload->>'nomePai','')), '\s+', ' ', 'g'),'');
  v_override  := NULLIF(btrim(coalesce(p_payload->>'duplicateOverrideReason','')),'');

  IF length(v_prenome) < 2 OR length(v_prenome) > 100 THEN
    RAISE EXCEPTION 'INVALID_PRENOME' USING ERRCODE='22023';
  END IF;
  IF length(v_sobrenome) < 2 OR length(v_sobrenome) > 150 THEN
    RAISE EXCEPTION 'INVALID_SOBRENOME' USING ERRCODE='22023';
  END IF;
  IF v_dob IS NULL OR v_dob > current_date THEN
    RAISE EXCEPTION 'INVALID_BIRTHDATE' USING ERRCODE='22023';
  END IF;
  IF EXTRACT(YEAR FROM age(current_date, v_dob))::int < 18 THEN
    RAISE EXCEPTION 'AGE_NOT_ADULT' USING ERRCODE='22023';
  END IF;
  IF v_cpf IS NOT NULL AND NOT private.is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'INVALID_CPF' USING ERRCODE='22023';
  END IF;

  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.assistidos
      WHERE cpf = v_cpf AND deleted_at IS NULL LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code','CPF_ALREADY_EXISTS','existingAssistidoId', v_existing_id);
    END IF;
  END IF;

  IF v_cpf IS NULL AND v_override IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome_completo, 'data_nascimento', a.data_nascimento,
      'categoria', a.categoria)), '[]'::jsonb)
      INTO v_dup
      FROM public.assistidos a
     WHERE a.deleted_at IS NULL
       AND a.orgao_execucao_id = v_org
       AND a.data_nascimento = v_dob
       AND private.normalize_search_text(a.nome_completo)
           = private.normalize_search_text(v_prenome || ' ' || v_sobrenome);
    IF v_dup <> '[]'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'code','POSSIBLE_DUPLICATE_ASSISTIDO','candidates', v_dup);
    END IF;
  END IF;

  INSERT INTO public.assistidos (
    prenome, sobrenome, nome_completo, data_nascimento, sexo_registral, genero,
    cpf, nome_mae, nome_pai, categoria, orgao_execucao_id, created_by, updated_by
  ) VALUES (
    v_prenome, v_sobrenome, v_prenome || ' ' || v_sobrenome, v_dob, v_sexo, v_genero,
    v_cpf, v_nome_mae, v_nome_pai, 'adulto', v_org, v_uid, v_uid
  ) RETURNING id INTO v_id;

  -- Vínculos com crianças (direção padrão: origem=criança, destino=adulto=v_id)
  v_criancas := COALESCE(p_payload->'criancas','[]'::jsonb);
  IF jsonb_typeof(v_criancas) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org, (c->>'assistidoId')::uuid, v_id, (c->>'tipo')::public.vinculo_enum, v_uid
      FROM jsonb_array_elements(v_criancas) c
     WHERE (c->>'assistidoId') IS NOT NULL AND (c->>'tipo') IS NOT NULL;
  END IF;

  v_actor_role := CASE WHEN private.is_admin_tecnico() THEN 'admin_tecnico'
                       WHEN private.current_user_is_admin() THEN 'admin_institucional'
                       ELSE 'defensor_publico' END;
  PERFORM private.log_audit_event('assistido.adult_created','assistido', v_id::text,
    'sucesso', NULL,
    jsonb_build_object('override_dup', v_override IS NOT NULL, 'tem_cpf', v_cpf IS NOT NULL),
    v_org, v_correlation, v_actor_role);

  RETURN jsonb_build_object('ok', true, 'code','ASSISTIDO_CREATED',
    'id', v_id, 'categoria','adulto', 'correlationId', v_correlation);
END $$;

REVOKE ALL ON FUNCTION public.cadastrar_assistido_adulto(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_assistido_adulto(jsonb) TO authenticated;

-- ============================================================
-- RPC: vincular foto (após upload no Storage)
-- ============================================================
CREATE OR REPLACE FUNCTION public.vincular_foto_assistido(p_assistido_id uuid, p_foto_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF NOT private.user_can_access_assistido(p_assistido_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF p_foto_path IS NULL OR p_foto_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' THEN
    RAISE EXCEPTION 'INVALID_PHOTO_PATH' USING ERRCODE='22023';
  END IF;

  UPDATE public.assistidos
     SET foto_path = p_foto_path, updated_by = v_uid
   WHERE id = p_assistido_id AND deleted_at IS NULL
   RETURNING orgao_execucao_id INTO v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  PERFORM private.log_audit_event('assistido.photo_uploaded','assistido', p_assistido_id::text,
    'sucesso', NULL, NULL, v_org, NULL, NULL);

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.vincular_foto_assistido(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_foto_assistido(uuid, text) TO authenticated;

-- ============================================================
-- RPC: cadastrar processo (com N assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cadastrar_processo(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_num_raw text; v_num_norm text;
  v_data date;
  v_status public.situacao_processo_enum;
  v_ids uuid[];
  v_missing int;
  v_existing_id uuid;
  v_id uuid;
  v_actor_role public.app_role;
  v_correlation uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_org := private.resolve_target_org(NULLIF(p_payload->>'orgaoId','')::uuid);

  v_num_raw  := btrim(coalesce(p_payload->>'numeroProcesso',''));
  v_num_norm := regexp_replace(v_num_raw, '\D','','g');
  IF length(v_num_norm) <> 20 THEN
    RAISE EXCEPTION 'INVALID_CNJ_FORMAT' USING ERRCODE='22023';
  END IF;

  v_data := NULLIF(p_payload->>'dataInicio','')::date;
  IF v_data IS NULL OR v_data > current_date THEN
    RAISE EXCEPTION 'INVALID_DATA_INICIO' USING ERRCODE='22023';
  END IF;

  v_status := NULLIF(p_payload->>'status','')::public.situacao_processo_enum;

  SELECT array_agg(DISTINCT (x)::uuid) INTO v_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload->'assistidoIds','[]'::jsonb)) x
   WHERE x IS NOT NULL AND x <> '';

  IF v_ids IS NULL OR array_length(v_ids,1) = 0 THEN
    RAISE EXCEPTION 'AT_LEAST_ONE_ASSISTIDO_REQUIRED' USING ERRCODE='22023';
  END IF;

  -- Todos os assistidos precisam existir e ser acessíveis pelo usuário
  SELECT count(*) INTO v_missing
    FROM unnest(v_ids) t(id)
   WHERE NOT private.user_can_access_assistido(t.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_ACCESSIBLE' USING ERRCODE='42501';
  END IF;

  -- Duplicidade no órgão
  SELECT id INTO v_existing_id FROM public.processos
    WHERE orgao_execucao_id = v_org
      AND numero_processo_normalizado = v_num_norm
      AND deleted_at IS NULL LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','PROCESS_ALREADY_EXISTS','existingProcessoId', v_existing_id);
  END IF;

  INSERT INTO public.processos (
    orgao_execucao_id, numero_processo, numero_processo_normalizado,
    data_inicio, status, created_by, updated_by
  ) VALUES (
    v_org, v_num_raw, v_num_norm, v_data, v_status, v_uid, v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.processo_assistidos (processo_id, assistido_id, created_by)
  SELECT v_id, t.id, v_uid FROM unnest(v_ids) t(id)
  ON CONFLICT DO NOTHING;

  v_actor_role := CASE WHEN private.is_admin_tecnico() THEN 'admin_tecnico'
                       WHEN private.current_user_is_admin() THEN 'admin_institucional'
                       ELSE 'defensor_publico' END;
  PERFORM private.log_audit_event('process.created','processo', v_id::text,
    'sucesso', NULL,
    jsonb_build_object('assistidos_count', array_length(v_ids,1)),
    v_org, v_correlation, v_actor_role);

  RETURN jsonb_build_object('ok', true, 'code','PROCESS_CREATED',
    'id', v_id, 'correlationId', v_correlation);
END $$;

REVOKE ALL ON FUNCTION public.cadastrar_processo(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_processo(jsonb) TO authenticated;

-- ============================================================
-- RPC helper: buscar assistidos para picker (respeita RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_assistidos_picker(
  p_text text DEFAULT NULL,
  p_categoria public.assistido_categoria_enum DEFAULT NULL,
  p_exclude uuid[] DEFAULT NULL,
  p_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_tecnico boolean;
  v_txt text;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  v_tecnico := private.is_admin_tecnico() OR private.current_user_is_admin();
  v_org := private.current_active_org_id();
  v_txt := NULLIF(private.normalize_search_text(coalesce(p_text,'')),'');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'nome_completo', a.nome_completo,
    'data_nascimento', a.data_nascimento,
    'categoria', a.categoria,
    'cpf_mascarado', CASE WHEN a.cpf IS NULL THEN NULL
                          ELSE '***.' || substring(a.cpf,4,3) || '.' || substring(a.cpf,7,3) || '-**' END
  )), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.*
      FROM public.assistidos a
     WHERE a.deleted_at IS NULL
       AND (v_tecnico OR a.orgao_execucao_id = v_org)
       AND (p_categoria IS NULL OR a.categoria = p_categoria)
       AND (p_exclude IS NULL OR NOT (a.id = ANY(p_exclude)))
       AND (v_txt IS NULL OR a.search_text ILIKE '%' || v_txt || '%')
     ORDER BY a.nome_completo
     LIMIT LEAST(GREATEST(p_limit,1),50)
  ) a;

  RETURN v_rows;
END $$;

REVOKE ALL ON FUNCTION public.buscar_assistidos_picker(text, public.assistido_categoria_enum, uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_assistidos_picker(text, public.assistido_categoria_enum, uuid[], int) TO authenticated;
