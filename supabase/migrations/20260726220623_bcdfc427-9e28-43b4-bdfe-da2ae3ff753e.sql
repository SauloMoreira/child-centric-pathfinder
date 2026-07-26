-- ============================================================
-- 1) Corrige faixa etária em v_assistidos_card
-- ============================================================
CREATE OR REPLACE VIEW public.v_assistidos_card
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.nome_completo,
  a.nome_social,
  a.data_nascimento,
  date_part('year', age(a.data_nascimento))::int AS idade,
  CASE
    WHEN date_part('year', age(a.data_nascimento)) < 12 THEN 'crianca'
    WHEN date_part('year', age(a.data_nascimento)) < 18 THEN 'adolescente'
    ELSE NULL
  END AS faixa_etaria,
  a.sexo_registral,
  a.genero,
  a.foto_url,
  a.situacao_atual,
  a.orgao_execucao_id,
  a.responsavel_user_id,
  a.updated_at,
  (SELECT ac.id FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS acolhimento_ativo_id,
  (SELECT ac.entidade_nome FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS entidade_acolhimento,
  (SELECT ac.tipo FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tipo_acolhimento,
  (SELECT (CURRENT_DATE - ac.data_ingresso)::int
     FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tempo_acolhimento_dias,
  (SELECT ac.data_reavaliacao FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS proxima_reavaliacao,
  (SELECT COUNT(*)::int FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao = 'ativo') AS processos_ativos,
  (SELECT MIN(p.prazo_proximo) FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao='ativo' AND p.prazo_proximo IS NOT NULL) AS prazo_processo_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL) AS providencias_pendentes,
  (SELECT MIN(pr.prazo) FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL AND pr.prazo IS NOT NULL) AS prazo_providencia_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS total_familiares,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id
     AND f.parentesco IN ('irmao','irma')) AS total_irmaos,
  (SELECT BOOL_OR(f.assistido_pela_dpe) FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS familiar_dpe,
  a.search_text
FROM public.assistidos a
WHERE a.deleted_at IS NULL;

GRANT SELECT ON public.v_assistidos_card TO authenticated;

-- ============================================================
-- 2) get_workspace_column_assistidos: usar a view rica
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_column_assistidos(
  p_column_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_col RECORD; v_org uuid; v_result jsonb;
  v_lim int; v_off int;
BEGIN
  SELECT c.*, w.orgao_execucao_id AS org_id
    INTO v_col
    FROM private.orgao_workspace_columns c
    JOIN private.orgao_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := v_col.org_id;
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_lim := greatest(1, least(coalesce(p_limit, 20), 200));
  v_off := greatest(0, coalesce(p_offset, 0));

  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'nome_completo', x.nome_completo,
          'nome_social', x.nome_social,
          'idade', x.idade,
          'faixa_etaria', x.faixa_etaria,
          'sexo_registral', x.sexo_registral,
          'foto_url', x.foto_url,
          'situacao_atual', x.situacao_atual,
          'orgao_execucao_id', x.orgao_execucao_id,
          'entidade_acolhimento', x.entidade_acolhimento,
          'tipo_acolhimento', x.tipo_acolhimento,
          'tempo_acolhimento_dias', x.tempo_acolhimento_dias,
          'proxima_reavaliacao', x.proxima_reavaliacao,
          'processos_ativos', x.processos_ativos,
          'prazo_processo_mais_proximo', x.prazo_processo_mais_proximo,
          'providencias_pendentes', x.providencias_pendentes,
          'prazo_providencia_mais_proximo', x.prazo_providencia_mais_proximo,
          'total_familiares', x.total_familiares,
          'total_irmaos', x.total_irmaos,
          'familiar_dpe', x.familiar_dpe,
          'updated_at', x.updated_at
        )
        ORDER BY x.updated_at DESC
      )
      FROM (
        SELECT v.*
          FROM public.v_assistidos_card v
          JOIN public.assistidos a ON a.id = v.id
         WHERE v.orgao_execucao_id = v_org
           AND a.categoria = 'crianca_adolescente'
         ORDER BY v.updated_at DESC
         LIMIT v_lim
         OFFSET v_off
      ) x
    ), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM public.assistidos a
       WHERE a.deleted_at IS NULL
         AND a.orgao_execucao_id = v_org
         AND a.categoria = 'crianca_adolescente'
    )
  ) INTO v_result;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) TO authenticated;

-- ============================================================
-- 3) atualizar_assistido_crianca
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_assistido_crianca(
  p_assistido_id uuid, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  v_fam jsonb; v_irm jsonb;
  v_actor_role public.app_role;
  v_correlation uuid := gen_random_uuid();
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF NOT private.user_can_access_assistido(p_assistido_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_execucao_id INTO v_org
    FROM public.assistidos
   WHERE id = p_assistido_id
     AND deleted_at IS NULL
     AND categoria = 'crianca_adolescente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

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

  -- CPF já existe em outro registro
  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.assistidos
      WHERE cpf = v_cpf AND deleted_at IS NULL AND id <> p_assistido_id LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code','CPF_ALREADY_EXISTS','existingAssistidoId', v_existing_id);
    END IF;
  END IF;

  -- Duplicidade sem CPF (excluindo o próprio)
  IF v_cpf IS NULL AND v_override IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome_completo, 'data_nascimento', a.data_nascimento,
      'categoria', a.categoria)), '[]'::jsonb)
      INTO v_dup
      FROM public.assistidos a
     WHERE a.deleted_at IS NULL
       AND a.id <> p_assistido_id
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

  UPDATE public.assistidos SET
    prenome = v_prenome,
    sobrenome = v_sobrenome,
    nome_completo = v_prenome || ' ' || v_sobrenome,
    data_nascimento = v_dob,
    sexo_registral = v_sexo,
    genero = v_genero,
    cpf = v_cpf,
    nome_mae = v_nome_mae,
    nome_pai = v_nome_pai,
    updated_by = v_uid,
    updated_at = now()
  WHERE id = p_assistido_id;

  -- Reconciliar vínculos familiares (origem_id = p_assistido_id, tipo em pai/mae/familia_extensa)
  UPDATE public.assistido_vinculos SET deleted_at = now(), deleted_by = v_uid
   WHERE origem_id = p_assistido_id
     AND tipo IN ('pai','mae','familia_extensa')
     AND deleted_at IS NULL;

  v_fam := COALESCE(p_payload->'familiares','[]'::jsonb);
  IF jsonb_typeof(v_fam) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org, p_assistido_id, (f->>'assistidoId')::uuid, (f->>'tipo')::public.vinculo_enum, v_uid
      FROM jsonb_array_elements(v_fam) f
     WHERE (f->>'assistidoId') IS NOT NULL AND (f->>'tipo') IS NOT NULL;
  END IF;

  -- Reconciliar irmãos (qualquer vinculo tipo='irmao' envolvendo p_assistido_id)
  UPDATE public.assistido_vinculos SET deleted_at = now(), deleted_by = v_uid
   WHERE tipo = 'irmao'
     AND (origem_id = p_assistido_id OR destino_id = p_assistido_id)
     AND deleted_at IS NULL;

  v_irm := COALESCE(p_payload->'irmaos','[]'::jsonb);
  IF jsonb_typeof(v_irm) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org,
           LEAST(p_assistido_id, (i)::uuid),
           GREATEST(p_assistido_id, (i)::uuid),
           'irmao', v_uid
      FROM jsonb_array_elements_text(v_irm) i
     WHERE i IS NOT NULL AND i <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  v_actor_role := CASE WHEN private.is_admin_tecnico() THEN 'admin_tecnico'
                       WHEN private.current_user_is_admin() THEN 'admin_institucional'
                       ELSE 'defensor_publico' END;
  PERFORM private.log_audit_event('assistido.child_updated','assistido', p_assistido_id::text,
    'sucesso', NULL,
    jsonb_build_object('override_dup', v_override IS NOT NULL, 'tem_cpf', v_cpf IS NOT NULL),
    v_org, v_correlation, v_actor_role);

  RETURN jsonb_build_object('ok', true, 'code','ASSISTIDO_UPDATED',
    'id', p_assistido_id, 'categoria','crianca_adolescente', 'correlationId', v_correlation);
END $$;

REVOKE ALL ON FUNCTION public.atualizar_assistido_crianca(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_assistido_crianca(uuid, jsonb) TO authenticated;

-- ============================================================
-- 4) atualizar_assistido_adulto
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_assistido_adulto(
  p_assistido_id uuid, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  v_criancas jsonb;
  v_actor_role public.app_role;
  v_correlation uuid := gen_random_uuid();
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF NOT private.user_can_access_assistido(p_assistido_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT orgao_execucao_id INTO v_org
    FROM public.assistidos
   WHERE id = p_assistido_id
     AND deleted_at IS NULL
     AND categoria = 'adulto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

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
      WHERE cpf = v_cpf AND deleted_at IS NULL AND id <> p_assistido_id LIMIT 1;
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
       AND a.id <> p_assistido_id
       AND a.orgao_execucao_id = v_org
       AND a.data_nascimento = v_dob
       AND private.normalize_search_text(a.nome_completo)
           = private.normalize_search_text(v_prenome || ' ' || v_sobrenome);
    IF v_dup <> '[]'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'code','POSSIBLE_DUPLICATE_ASSISTIDO','candidates', v_dup);
    END IF;
  END IF;

  UPDATE public.assistidos SET
    prenome = v_prenome,
    sobrenome = v_sobrenome,
    nome_completo = v_prenome || ' ' || v_sobrenome,
    data_nascimento = v_dob,
    sexo_registral = v_sexo,
    genero = v_genero,
    cpf = v_cpf,
    nome_mae = v_nome_mae,
    nome_pai = v_nome_pai,
    updated_by = v_uid,
    updated_at = now()
  WHERE id = p_assistido_id;

  -- Reconciliar vínculos com crianças (destino_id = p_assistido_id, tipo pai/mae/familia_extensa)
  UPDATE public.assistido_vinculos SET deleted_at = now(), deleted_by = v_uid
   WHERE destino_id = p_assistido_id
     AND tipo IN ('pai','mae','familia_extensa')
     AND deleted_at IS NULL;

  v_criancas := COALESCE(p_payload->'criancas','[]'::jsonb);
  IF jsonb_typeof(v_criancas) = 'array' THEN
    INSERT INTO public.assistido_vinculos (orgao_execucao_id, origem_id, destino_id, tipo, created_by)
    SELECT v_org, (c->>'assistidoId')::uuid, p_assistido_id, (c->>'tipo')::public.vinculo_enum, v_uid
      FROM jsonb_array_elements(v_criancas) c
     WHERE (c->>'assistidoId') IS NOT NULL AND (c->>'tipo') IS NOT NULL;
  END IF;

  v_actor_role := CASE WHEN private.is_admin_tecnico() THEN 'admin_tecnico'
                       WHEN private.current_user_is_admin() THEN 'admin_institucional'
                       ELSE 'defensor_publico' END;
  PERFORM private.log_audit_event('assistido.adult_updated','assistido', p_assistido_id::text,
    'sucesso', NULL,
    jsonb_build_object('override_dup', v_override IS NOT NULL, 'tem_cpf', v_cpf IS NOT NULL),
    v_org, v_correlation, v_actor_role);

  RETURN jsonb_build_object('ok', true, 'code','ASSISTIDO_UPDATED',
    'id', p_assistido_id, 'categoria','adulto', 'correlationId', v_correlation);
END $$;

REVOKE ALL ON FUNCTION public.atualizar_assistido_adulto(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_assistido_adulto(uuid, jsonb) TO authenticated;

-- ============================================================
-- 5) atualizar_anotacoes_assistido
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_anotacoes_assistido(
  p_assistido_id uuid, p_observacoes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_obs text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  IF NOT private.user_can_access_assistido(p_assistido_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_obs := NULLIF(btrim(coalesce(p_observacoes,'')),'');
  IF v_obs IS NOT NULL AND length(v_obs) > 8000 THEN
    RAISE EXCEPTION 'OBSERVACOES_TOO_LONG' USING ERRCODE='22023';
  END IF;

  UPDATE public.assistidos
     SET observacoes = v_obs,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = p_assistido_id
     AND deleted_at IS NULL
   RETURNING orgao_execucao_id INTO v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  PERFORM private.log_audit_event('assistido.notes_updated','assistido', p_assistido_id::text,
    'sucesso', NULL, jsonb_build_object('length', coalesce(length(v_obs), 0)),
    v_org, NULL, NULL);

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.atualizar_anotacoes_assistido(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_anotacoes_assistido(uuid, text) TO authenticated;