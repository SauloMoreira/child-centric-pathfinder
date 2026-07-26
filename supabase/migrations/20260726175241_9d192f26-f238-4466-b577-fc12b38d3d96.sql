
-- ============================================================
-- 0016 — Workspaces (Kanban personalizável) + RPCs de filtro
-- ============================================================

CREATE TYPE public.workspace_color_enum AS ENUM (
  'neutral','green','blue','amber','burgundy','purple','slate','rose'
);

CREATE TYPE public.workspace_context_enum AS ENUM ('orgao','todos_orgaos');

-- Tabelas -----------------------------------------------------
CREATE TABLE private.user_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  orgao_execucao_id uuid REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  context_type public.workspace_context_enum NOT NULL DEFAULT 'orgao',
  nome text NOT NULL DEFAULT 'Meu quadro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_workspace_ctx UNIQUE (user_id, orgao_execucao_id, context_type),
  CONSTRAINT ck_workspace_ctx CHECK (
    (context_type = 'orgao' AND orgao_execucao_id IS NOT NULL) OR
    (context_type = 'todos_orgaos' AND orgao_execucao_id IS NULL)
  )
);
ALTER TABLE private.user_workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE private.user_workspace_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES private.user_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  color_token public.workspace_color_enum NOT NULL DEFAULT 'neutral',
  custom_color text,
  filter_definition jsonb NOT NULL DEFAULT '{"version":1,"text":null,"conditions":[]}'::jsonb,
  position int NOT NULL,
  is_base_column boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_column_custom_color CHECK (custom_color IS NULL OR custom_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT ck_column_title_len CHECK (char_length(title) BETWEEN 3 AND 80),
  CONSTRAINT ck_column_desc_len CHECK (description IS NULL OR char_length(description) <= 240)
);
CREATE UNIQUE INDEX ux_workspace_base ON private.user_workspace_columns(workspace_id) WHERE is_base_column;
CREATE INDEX idx_workspace_column_ws ON private.user_workspace_columns(workspace_id, position);
ALTER TABLE private.user_workspace_columns ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tg_uw_updated
BEFORE UPDATE ON private.user_workspaces
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER tg_uwc_updated
BEFORE UPDATE ON private.user_workspace_columns
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Sem acesso direto do usuário; só via RPCs (SECURITY DEFINER)
REVOKE ALL ON private.user_workspaces FROM PUBLIC, authenticated;
REVOKE ALL ON private.user_workspace_columns FROM PUBLIC, authenticated;
GRANT ALL ON private.user_workspaces TO service_role;
GRANT ALL ON private.user_workspace_columns TO service_role;

-- ============================================================
-- Validação do JSON de filtros — allowlist
-- ============================================================
CREATE OR REPLACE FUNCTION private.validate_filter_definition(p_filter jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_conditions jsonb;
  v_cond jsonb;
  v_field text;
  v_op text;
  v_allowed_fields text[] := ARRAY[
    'faixa_etaria','idade_min','idade_max','sexo_registral','tem_foto',
    'situacao_atual','acolhimento_ativo','tipo_acolhimento','entidade_acolhimento',
    'tempo_acolhimento_dias','reavaliacao_status',
    'tem_processo_ativo','tipo_processo','situacao_processo','prioridade_demanda',
    'tem_demanda_extrajudicial','familiar_dpe',
    'tem_providencia_pendente','prazo_status','responsavel_user_id',
    'tem_vinculos_familiares','tem_irmaos','ultima_atualizacao_bucket',
    'orgao_execucao_id','comarca'
  ];
  v_allowed_ops text[] := ARRAY[
    'equals','not_equals','contains','in','not_in',
    'greater_than','greater_or_equal','less_than','less_or_equal',
    'between','is_null','is_not_null'
  ];
BEGIN
  IF p_filter IS NULL THEN
    RETURN '{"version":1,"text":null,"conditions":[]}'::jsonb;
  END IF;
  IF jsonb_typeof(p_filter) <> 'object' THEN
    RAISE EXCEPTION 'FILTER_INVALID_ROOT' USING ERRCODE='22023';
  END IF;
  IF COALESCE((p_filter->>'version')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'FILTER_UNSUPPORTED_VERSION' USING ERRCODE='22023';
  END IF;

  v_conditions := COALESCE(p_filter->'conditions', '[]'::jsonb);
  IF jsonb_typeof(v_conditions) <> 'array' THEN
    RAISE EXCEPTION 'FILTER_CONDITIONS_MUST_BE_ARRAY' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(v_conditions) > 20 THEN
    RAISE EXCEPTION 'FILTER_TOO_MANY_CONDITIONS' USING ERRCODE='22023';
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conditions) LOOP
    IF jsonb_typeof(v_cond) <> 'object' THEN
      RAISE EXCEPTION 'FILTER_CONDITION_INVALID' USING ERRCODE='22023';
    END IF;
    v_field := v_cond->>'field';
    v_op := v_cond->>'operator';
    IF v_field IS NULL OR NOT (v_field = ANY(v_allowed_fields)) THEN
      RAISE EXCEPTION 'FILTER_FIELD_NOT_ALLOWED: %', v_field USING ERRCODE='22023';
    END IF;
    IF v_op IS NULL OR NOT (v_op = ANY(v_allowed_ops)) THEN
      RAISE EXCEPTION 'FILTER_OPERATOR_NOT_ALLOWED: %', v_op USING ERRCODE='22023';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'version', 1,
    'text', CASE WHEN jsonb_typeof(p_filter->'text') = 'string'
              THEN NULLIF(btrim(p_filter->>'text'),'')
              ELSE NULL END,
    'conditions', v_conditions
  );
END $$;

-- ============================================================
-- Motor de consulta: converte filtros em SQL parametrizado
-- Retorna set de v_assistidos_card
-- ============================================================
CREATE OR REPLACE FUNCTION private.query_assistidos_by_filter(
  p_filter jsonb,
  p_text text,
  p_orgao_id uuid,
  p_limit int,
  p_offset int
) RETURNS TABLE(row_data jsonb, total_count bigint)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cond jsonb;
  v_field text;
  v_op text;
  v_val jsonb;
  v_where text := ' TRUE ';
  v_sql text;
  v_norm_text text;
  v_uid uuid := auth.uid();
  v_is_tec boolean := private.is_admin_tecnico();
  v_is_inst boolean := private.current_user_is_admin();
  v_active_org uuid := private.current_active_org_id();
BEGIN
  -- Escopo institucional
  IF v_is_tec THEN
    IF p_orgao_id IS NOT NULL THEN
      v_where := v_where || format(' AND c.orgao_execucao_id = %L', p_orgao_id);
    END IF;
  ELSIF v_is_inst THEN
    IF p_orgao_id IS NOT NULL THEN
      v_where := v_where || format(' AND c.orgao_execucao_id = %L', p_orgao_id);
    END IF;
  ELSE
    IF v_active_org IS NULL THEN
      RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501';
    END IF;
    v_where := v_where || format(' AND c.orgao_execucao_id = %L', v_active_org);
  END IF;

  -- Texto de busca
  IF p_text IS NOT NULL AND btrim(p_text) <> '' THEN
    v_norm_text := private.normalize_search_text(p_text);
    v_where := v_where || format(' AND c.search_text LIKE %L', '%' || v_norm_text || '%');
  END IF;

  -- Percorre condições
  FOR v_cond IN SELECT * FROM jsonb_array_elements(COALESCE(p_filter->'conditions','[]'::jsonb)) LOOP
    v_field := v_cond->>'field';
    v_op := v_cond->>'operator';
    v_val := v_cond->'value';

    IF v_field = 'faixa_etaria' AND v_op = 'equals' THEN
      v_where := v_where || format(' AND c.faixa_etaria = %L', v_val #>> '{}');
    ELSIF v_field = 'idade_min' AND v_op IN ('greater_or_equal','greater_than') THEN
      v_where := v_where || format(' AND c.idade >= %s', (v_val #>> '{}')::int);
    ELSIF v_field = 'idade_max' AND v_op IN ('less_or_equal','less_than') THEN
      v_where := v_where || format(' AND c.idade <= %s', (v_val #>> '{}')::int);
    ELSIF v_field = 'sexo_registral' AND v_op = 'equals' THEN
      v_where := v_where || format(' AND c.sexo_registral::text = %L', v_val #>> '{}');
    ELSIF v_field = 'tem_foto' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.foto_url IS NOT NULL';
      ELSE
        v_where := v_where || ' AND c.foto_url IS NULL';
      END IF;
    ELSIF v_field = 'situacao_atual' AND v_op = 'in' THEN
      v_where := v_where || format(' AND c.situacao_atual::text = ANY(%L::text[])',
        (SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(v_val) x));
    ELSIF v_field = 'situacao_atual' AND v_op = 'equals' THEN
      v_where := v_where || format(' AND c.situacao_atual::text = %L', v_val #>> '{}');
    ELSIF v_field = 'acolhimento_ativo' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.acolhimento_ativo_id IS NOT NULL';
      ELSE
        v_where := v_where || ' AND c.acolhimento_ativo_id IS NULL';
      END IF;
    ELSIF v_field = 'tipo_acolhimento' AND v_op = 'equals' THEN
      v_where := v_where || format(' AND c.tipo_acolhimento::text = %L', v_val #>> '{}');
    ELSIF v_field = 'entidade_acolhimento' AND v_op = 'contains' THEN
      v_where := v_where || format(' AND private.normalize_search_text(c.entidade_acolhimento) LIKE %L',
        '%' || private.normalize_search_text(v_val #>> '{}') || '%');
    ELSIF v_field = 'tempo_acolhimento_dias' AND v_op = 'greater_than' THEN
      v_where := v_where || format(' AND c.tempo_acolhimento_dias > %s', (v_val #>> '{}')::int);
    ELSIF v_field = 'tempo_acolhimento_dias' AND v_op = 'greater_or_equal' THEN
      v_where := v_where || format(' AND c.tempo_acolhimento_dias >= %s', (v_val #>> '{}')::int);
    ELSIF v_field = 'reavaliacao_status' AND v_op = 'equals' THEN
      IF v_val #>> '{}' = 'vencida' THEN
        v_where := v_where || ' AND c.proxima_reavaliacao < CURRENT_DATE';
      ELSIF v_val #>> '{}' = 'proxima' THEN
        v_where := v_where || ' AND c.proxima_reavaliacao BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL ''30 days''';
      END IF;
    ELSIF v_field = 'tem_processo_ativo' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.processos_ativos > 0';
      ELSE
        v_where := v_where || ' AND c.processos_ativos = 0';
      END IF;
    ELSIF v_field = 'prioridade_demanda' AND v_op = 'in' THEN
      v_where := v_where || format(
        ' AND EXISTS (SELECT 1 FROM public.assistido_processos p WHERE p.assistido_id = c.id AND p.situacao=''ativo'' AND p.prioridade::text = ANY(%L::text[]))',
        (SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(v_val) x));
    ELSIF v_field = 'tem_demanda_extrajudicial' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND EXISTS (SELECT 1 FROM public.assistido_processos p WHERE p.assistido_id=c.id AND p.extrajudicial)';
      ELSE
        v_where := v_where || ' AND NOT EXISTS (SELECT 1 FROM public.assistido_processos p WHERE p.assistido_id=c.id AND p.extrajudicial)';
      END IF;
    ELSIF v_field = 'familiar_dpe' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.familiar_dpe = true';
      ELSE
        v_where := v_where || ' AND (c.familiar_dpe IS NULL OR c.familiar_dpe = false)';
      END IF;
    ELSIF v_field = 'tem_providencia_pendente' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.providencias_pendentes > 0';
      ELSE
        v_where := v_where || ' AND c.providencias_pendentes = 0';
      END IF;
    ELSIF v_field = 'prazo_status' AND v_op = 'equals' THEN
      IF v_val #>> '{}' = 'vencido' THEN
        v_where := v_where || ' AND (c.prazo_processo_mais_proximo < CURRENT_DATE OR c.prazo_providencia_mais_proximo < CURRENT_DATE)';
      ELSIF v_val #>> '{}' = '7dias' THEN
        v_where := v_where || ' AND (c.prazo_processo_mais_proximo BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 OR c.prazo_providencia_mais_proximo BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)';
      ELSIF v_val #>> '{}' = '30dias' THEN
        v_where := v_where || ' AND (c.prazo_processo_mais_proximo BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 OR c.prazo_providencia_mais_proximo BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)';
      END IF;
    ELSIF v_field = 'responsavel_user_id' AND v_op = 'equals' THEN
      v_where := v_where || format(' AND c.responsavel_user_id = %L', (v_val #>> '{}')::uuid);
    ELSIF v_field = 'tem_vinculos_familiares' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.total_familiares > 0';
      ELSE
        v_where := v_where || ' AND c.total_familiares = 0';
      END IF;
    ELSIF v_field = 'tem_irmaos' AND v_op = 'equals' THEN
      IF (v_val #>> '{}')::boolean THEN
        v_where := v_where || ' AND c.total_irmaos > 0';
      END IF;
    ELSIF v_field = 'ultima_atualizacao_bucket' AND v_op = 'equals' THEN
      IF v_val #>> '{}' = 'hoje' THEN
        v_where := v_where || ' AND c.updated_at::date = CURRENT_DATE';
      ELSIF v_val #>> '{}' = '7dias' THEN
        v_where := v_where || ' AND c.updated_at >= now() - interval ''7 days''';
      ELSIF v_val #>> '{}' = 'sem_30dias' THEN
        v_where := v_where || ' AND c.updated_at < now() - interval ''30 days''';
      ELSIF v_val #>> '{}' = 'sem_90dias' THEN
        v_where := v_where || ' AND c.updated_at < now() - interval ''90 days''';
      END IF;
    ELSIF v_field = 'orgao_execucao_id' AND v_op = 'equals' AND (v_is_tec OR v_is_inst) THEN
      v_where := v_where || format(' AND c.orgao_execucao_id = %L', (v_val #>> '{}')::uuid);
    ELSIF v_field = 'comarca' AND v_op = 'equals' AND (v_is_tec OR v_is_inst) THEN
      v_where := v_where || format(
        ' AND EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id=c.orgao_execucao_id AND o.comarca_normalizada = %L)',
        private.normalize_search_text(v_val #>> '{}'));
    -- Silenciosamente ignora combinações desconhecidas (já validadas por validate_filter_definition)
    END IF;
  END LOOP;

  v_sql := format($f$
    WITH filtered AS (
      SELECT c.*, o.nome AS orgao_nome, o.comarca AS orgao_comarca
        FROM public.v_assistidos_card c
        LEFT JOIN public.orgaos_execucao o ON o.id = c.orgao_execucao_id
       WHERE %s
    ), total AS (SELECT COUNT(*)::bigint n FROM filtered)
    SELECT to_jsonb(f.*), (SELECT n FROM total)
      FROM filtered f
     ORDER BY f.nome_completo ASC
     LIMIT %s OFFSET %s
  $f$, v_where, LEAST(GREATEST(p_limit,1),100), GREATEST(p_offset,0));

  RETURN QUERY EXECUTE v_sql;
END $$;

REVOKE ALL ON FUNCTION private.query_assistidos_by_filter(jsonb,text,uuid,int,int) FROM PUBLIC;

-- ============================================================
-- RPCs públicas (SECURITY DEFINER)
-- ============================================================

-- Garante workspace + coluna base
CREATE OR REPLACE FUNCTION public.ensure_default_workspace(
  p_context text DEFAULT 'orgao',
  p_orgao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws_id uuid;
  v_ctx public.workspace_context_enum;
  v_orgao uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_ctx := CASE WHEN p_context = 'todos_orgaos' AND private.is_admin_tecnico()
                THEN 'todos_orgaos'::public.workspace_context_enum
                ELSE 'orgao'::public.workspace_context_enum END;

  IF v_ctx = 'orgao' THEN
    v_orgao := COALESCE(p_orgao_id, private.current_active_org_id());
    IF v_orgao IS NULL THEN
      RAISE EXCEPTION 'NO_ACTIVE_ORGANIZATION' USING ERRCODE='42501';
    END IF;
  ELSE
    v_orgao := NULL;
  END IF;

  SELECT id INTO v_ws_id FROM private.user_workspaces
   WHERE user_id = v_uid
     AND context_type = v_ctx
     AND (orgao_execucao_id IS NOT DISTINCT FROM v_orgao);

  IF v_ws_id IS NULL THEN
    INSERT INTO private.user_workspaces (user_id, orgao_execucao_id, context_type)
    VALUES (v_uid, v_orgao, v_ctx)
    RETURNING id INTO v_ws_id;

    INSERT INTO private.user_workspace_columns
      (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
    VALUES (v_ws_id,
      'Todas as crianças e adolescentes',
      'Todos os assistidos cadastrados neste contexto.',
      'neutral',
      '{"version":1,"text":null,"conditions":[]}'::jsonb,
      0, true, v_uid);

    PERFORM private.log_audit_event('workspace.created','workspace', v_ws_id::text,
      'sucesso', NULL, jsonb_build_object('context', v_ctx, 'orgao_id', v_orgao), v_orgao);
  END IF;

  RETURN jsonb_build_object('workspace_id', v_ws_id, 'context', v_ctx, 'orgao_id', v_orgao);
END $$;

-- Lista workspace + colunas
CREATE OR REPLACE FUNCTION public.listar_workspace(
  p_context text DEFAULT 'orgao',
  p_orgao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx public.workspace_context_enum;
  v_orgao uuid;
  v_ws_id uuid;
  v_cols jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_ctx := CASE WHEN p_context = 'todos_orgaos' AND private.is_admin_tecnico()
                THEN 'todos_orgaos' ELSE 'orgao' END;
  v_orgao := CASE WHEN v_ctx='orgao' THEN COALESCE(p_orgao_id, private.current_active_org_id()) END;

  SELECT id INTO v_ws_id FROM private.user_workspaces
   WHERE user_id = v_uid AND context_type = v_ctx
     AND (orgao_execucao_id IS NOT DISTINCT FROM v_orgao);

  IF v_ws_id IS NULL THEN
    RETURN jsonb_build_object('workspace_id', NULL, 'columns', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'description', description,
    'color_token', color_token, 'custom_color', custom_color,
    'filter_definition', filter_definition, 'position', position,
    'is_base_column', is_base_column, 'version', version,
    'updated_at', updated_at
  ) ORDER BY position), '[]'::jsonb) INTO v_cols
  FROM private.user_workspace_columns WHERE workspace_id = v_ws_id;

  RETURN jsonb_build_object('workspace_id', v_ws_id, 'context', v_ctx,
    'orgao_id', v_orgao, 'columns', v_cols);
END $$;

-- Criar coluna
CREATE OR REPLACE FUNCTION public.create_workspace_column(
  p_workspace_id uuid, p_title text, p_description text,
  p_color_token text, p_custom_color text, p_filter jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws private.user_workspaces%ROWTYPE;
  v_next_pos int;
  v_id uuid;
  v_filter jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = p_workspace_id;
  IF NOT FOUND OR v_ws.user_id <> v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_filter := private.validate_filter_definition(p_filter);

  SELECT COALESCE(MAX(position),0)+1 INTO v_next_pos
    FROM private.user_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO private.user_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition, position, created_by)
  VALUES (p_workspace_id, btrim(p_title), NULLIF(btrim(p_description),''),
          COALESCE(p_color_token::public.workspace_color_enum,'neutral'::public.workspace_color_enum),
          p_custom_color, v_filter, v_next_pos, v_uid)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('workspace.column_created','workspace_column', v_id::text,
    'sucesso', NULL, jsonb_build_object('workspace_id', p_workspace_id,
      'fields_used', (SELECT array_agg(x->>'field') FROM jsonb_array_elements(v_filter->'conditions') x)),
    v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true, 'column_id', v_id);
END $$;

-- Editar coluna
CREATE OR REPLACE FUNCTION public.update_workspace_column(
  p_column_id uuid, p_version int, p_title text, p_description text,
  p_color_token text, p_custom_color text, p_filter jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col private.user_workspace_columns%ROWTYPE;
  v_ws private.user_workspaces%ROWTYPE;
  v_filter jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_col FROM private.user_workspace_columns WHERE id = p_column_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = v_col.workspace_id;
  IF v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_col.version <> p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001'; END IF;

  -- Coluna base não aceita filtros
  IF v_col.is_base_column THEN
    v_filter := '{"version":1,"text":null,"conditions":[]}'::jsonb;
  ELSE
    v_filter := private.validate_filter_definition(p_filter);
  END IF;

  UPDATE private.user_workspace_columns
     SET title = btrim(p_title),
         description = NULLIF(btrim(p_description),''),
         color_token = COALESCE(p_color_token::public.workspace_color_enum, color_token),
         custom_color = p_custom_color,
         filter_definition = v_filter,
         version = version + 1,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_updated','workspace_column', p_column_id::text,
    'sucesso', NULL, jsonb_build_object('workspace_id', v_ws.id), v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true);
END $$;

-- Excluir coluna
CREATE OR REPLACE FUNCTION public.delete_workspace_column(p_column_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col private.user_workspace_columns%ROWTYPE;
  v_ws private.user_workspaces%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_col FROM private.user_workspace_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = v_col.workspace_id;
  IF v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_col.is_base_column THEN
    RAISE EXCEPTION 'CANNOT_DELETE_BASE_COLUMN' USING ERRCODE='42501';
  END IF;

  DELETE FROM private.user_workspace_columns WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_deleted','workspace_column', p_column_id::text,
    'sucesso', NULL, jsonb_build_object('workspace_id', v_ws.id), v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true);
END $$;

-- Duplicar coluna
CREATE OR REPLACE FUNCTION public.duplicate_workspace_column(p_column_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col private.user_workspace_columns%ROWTYPE;
  v_ws private.user_workspaces%ROWTYPE;
  v_new uuid;
  v_next_pos int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_col FROM private.user_workspace_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = v_col.workspace_id;
  IF v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(MAX(position),0)+1 INTO v_next_pos
    FROM private.user_workspace_columns WHERE workspace_id = v_col.workspace_id;

  INSERT INTO private.user_workspace_columns
    (workspace_id, title, description, color_token, custom_color, filter_definition, position, is_base_column, created_by)
  VALUES (v_col.workspace_id,
          left(v_col.title || ' (cópia)', 80),
          v_col.description, v_col.color_token, v_col.custom_color,
          v_col.filter_definition, v_next_pos, false, v_uid)
  RETURNING id INTO v_new;

  PERFORM private.log_audit_event('workspace.column_duplicated','workspace_column', v_new::text,
    'sucesso', NULL, jsonb_build_object('source', p_column_id), v_ws.orgao_execucao_id);

  RETURN jsonb_build_object('ok', true, 'column_id', v_new);
END $$;

-- Reordenar colunas
CREATE OR REPLACE FUNCTION public.reorder_workspace_columns(
  p_workspace_id uuid, p_ordered_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws private.user_workspaces%ROWTYPE;
  v_id uuid;
  v_pos int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = p_workspace_id;
  IF NOT FOUND OR v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  -- Move para posições negativas primeiro (evita conflito de unique se houver)
  UPDATE private.user_workspace_columns
     SET position = -1 - position
   WHERE workspace_id = p_workspace_id;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE private.user_workspace_columns
       SET position = v_pos, updated_by = v_uid, updated_at = now()
     WHERE id = v_id AND workspace_id = p_workspace_id;
    v_pos := v_pos + 1;
  END LOOP;

  PERFORM private.log_audit_event('workspace.columns_reordered','workspace', p_workspace_id::text,
    'sucesso', NULL, NULL, v_ws.orgao_execucao_id);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Restaurar padrão
CREATE OR REPLACE FUNCTION public.reset_workspace_to_default(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws private.user_workspaces%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = p_workspace_id;
  IF NOT FOUND OR v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  DELETE FROM private.user_workspace_columns WHERE workspace_id = p_workspace_id AND is_base_column = false;
  UPDATE private.user_workspace_columns
     SET title = 'Todas as crianças e adolescentes',
         description = 'Todos os assistidos cadastrados neste contexto.',
         color_token = 'neutral',
         custom_color = NULL,
         filter_definition = '{"version":1,"text":null,"conditions":[]}'::jsonb,
         position = 0, version = version + 1, updated_by = v_uid, updated_at = now()
   WHERE workspace_id = p_workspace_id AND is_base_column = true;

  PERFORM private.log_audit_event('workspace.reset','workspace', p_workspace_id::text,
    'sucesso', NULL, NULL, v_ws.orgao_execucao_id);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Buscar assistidos (busca superior)
CREATE OR REPLACE FUNCTION public.buscar_assistidos(
  p_text text DEFAULT NULL,
  p_filter jsonb DEFAULT NULL,
  p_orgao_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_filter jsonb;
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  v_filter := private.validate_filter_definition(p_filter);

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb), COALESCE(MAX(total_count),0)
    INTO v_rows, v_total
    FROM private.query_assistidos_by_filter(v_filter, p_text, p_orgao_id, p_limit, p_offset);

  RETURN jsonb_build_object('items', v_rows, 'total', v_total,
    'limit', LEAST(GREATEST(p_limit,1),100), 'offset', GREATEST(p_offset,0));
END $$;

-- Cards por coluna
CREATE OR REPLACE FUNCTION public.get_workspace_column_assistidos(
  p_column_id uuid, p_limit int DEFAULT 20, p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col private.user_workspace_columns%ROWTYPE;
  v_ws private.user_workspaces%ROWTYPE;
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_col FROM private.user_workspace_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO v_ws FROM private.user_workspaces WHERE id = v_col.workspace_id;
  IF v_ws.user_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb), COALESCE(MAX(total_count),0)
    INTO v_rows, v_total
    FROM private.query_assistidos_by_filter(v_col.filter_definition, NULL, v_ws.orgao_execucao_id, p_limit, p_offset);

  RETURN jsonb_build_object('items', v_rows, 'total', v_total,
    'column_id', p_column_id, 'workspace_id', v_ws.id);
END $$;

-- Revoke public
REVOKE ALL ON FUNCTION public.ensure_default_workspace(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_workspace(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_workspace_column(uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_workspace_column(uuid,int,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_workspace_column(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_workspace_column(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_workspace_columns(uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_workspace_to_default(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_assistidos(text,jsonb,uuid,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_workspace_column_assistidos(uuid,int,int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_default_workspace(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_workspace(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_column(uuid,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_column(uuid,int,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_workspace_column(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_workspace_column(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_workspace_columns(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_workspace_to_default(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_assistidos(text,jsonb,uuid,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_column_assistidos(uuid,int,int) TO authenticated;
