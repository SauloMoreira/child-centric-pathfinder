
-- =====================================================================
-- SUB-GATE 4.1.b · TURNO 3.A
-- defender_panels_backend_foundation
-- =====================================================================

-- ---------- PREFLIGHT ------------------------------------------------
DO $$
DECLARE
  v_dup int;
  v_pos_dup int;
BEGIN
  -- não pode existir nome ativo duplicado por defensor (case/space normalized)
  SELECT count(*) INTO v_dup FROM (
    SELECT defensor_user_id,
           lower(regexp_replace(btrim(nome), '\s+', ' ', 'g')) AS n
      FROM public.defensor_workspaces
     WHERE archived_at IS NULL
     GROUP BY 1,2
    HAVING count(*) > 1
  ) x;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_PANEL_NAME_DUP: existem % nomes normalizados duplicados', v_dup;
  END IF;

  -- posições duplicadas por defensor (ativas)
  SELECT count(*) INTO v_pos_dup FROM (
    SELECT defensor_user_id, order_position
      FROM public.defensor_workspaces
     WHERE archived_at IS NULL
     GROUP BY 1,2 HAVING count(*) > 1
  ) x;
  IF v_pos_dup > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_PANEL_POSITION_DUP: existem % posições ativas duplicadas', v_pos_dup;
  END IF;
END $$;

-- ---------- COLUNA NORMALIZADA ---------------------------------------
ALTER TABLE public.defensor_workspaces
  ADD COLUMN IF NOT EXISTS nome_normalizado text
  GENERATED ALWAYS AS (lower(regexp_replace(btrim(nome), '\s+', ' ', 'g'))) STORED;

-- ---------- ÍNDICES --------------------------------------------------
DROP INDEX IF EXISTS public.uq_active_workspace_per_defender;
DROP INDEX IF EXISTS public.defensor_workspaces_owner_idx;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_panel_name_per_defender
  ON public.defensor_workspaces (defensor_user_id, nome_normalizado)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_panel_position_per_defender
  ON public.defensor_workspaces (defensor_user_id, order_position)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS defensor_workspaces_active_idx
  ON public.defensor_workspaces (defensor_user_id, order_position)
  WHERE archived_at IS NULL;

-- ---------- GRANTS / RLS ---------------------------------------------
REVOKE ALL ON public.defensor_workspaces         FROM anon;
REVOKE ALL ON public.defensor_workspace_columns  FROM anon;
REVOKE ALL ON public.defensor_workspace_cards    FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspaces        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspace_columns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspace_cards   FROM authenticated;
GRANT  SELECT ON public.defensor_workspaces        TO authenticated;
GRANT  SELECT ON public.defensor_workspace_columns TO authenticated;
GRANT  SELECT ON public.defensor_workspace_cards   TO authenticated;

CREATE OR REPLACE FUNCTION private.can_view_workspace(p_user uuid, p_ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT can_view FROM private.user_workspace_access(p_user, p_ws)), false);
$$;

DROP POLICY IF EXISTS defensor_workspaces_select ON public.defensor_workspaces;
CREATE POLICY defensor_workspaces_select
  ON public.defensor_workspaces
  FOR SELECT TO authenticated
  USING (private.can_view_workspace(auth.uid(), id));

-- child policies já filtram via parent (EXISTS join); mantidas.

-- ---------- HELPERS PRIVADOS -----------------------------------------
CREATE OR REPLACE FUNCTION private.assert_authenticated_defensor(p_user uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_is_active_defensor(p_user) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.validate_panel_icon(p_icone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  v := nullif(btrim(coalesce(p_icone,'')), '');
  IF v IS NULL THEN RETURN NULL; END IF;
  IF char_length(v) > 40 OR v !~ '^[a-z][a-z0-9-]{0,39}$' THEN
    RAISE EXCEPTION 'INVALID_ICON' USING ERRCODE='22023';
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION private.validate_panel_name(p_nome text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  v := btrim(coalesce(p_nome,''));
  IF char_length(v) < 1 OR char_length(v) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023';
  END IF;
  RETURN regexp_replace(v, '\s+', ' ', 'g');
END $$;

CREATE OR REPLACE FUNCTION private.panel_owner(p_panel_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT defensor_user_id FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL;
$$;

-- ---------- REMOÇÃO DAS RPCs ANTIGAS DE ÓRGÃO ------------------------
DROP FUNCTION IF EXISTS public.criar_workspace(uuid, text, text);
DROP FUNCTION IF EXISTS public.duplicar_workspace(uuid, text);
DROP FUNCTION IF EXISTS public.listar_workspaces_orgao(uuid);
DROP FUNCTION IF EXISTS public.ensure_default_workspace(uuid);
DROP FUNCTION IF EXISTS public.definir_workspace_padrao(uuid);
DROP FUNCTION IF EXISTS public.excluir_workspace(uuid);
DROP FUNCTION IF EXISTS public.renomear_workspace(uuid, text);
DROP FUNCTION IF EXISTS public.reordenar_workspaces(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.atualizar_workspace_meta(uuid, text, text);
DROP FUNCTION IF EXISTS public.reset_workspace_to_default(uuid);
DROP FUNCTION IF EXISTS public.create_workspace_column(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.delete_workspace_column(uuid);
DROP FUNCTION IF EXISTS public.update_workspace_column(uuid, integer, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.duplicate_workspace_column(uuid);
DROP FUNCTION IF EXISTS public.reorder_workspace_columns(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.listar_workspace(uuid, uuid);

-- ---------- ensure_defensor_work_area --------------------------------
-- retorna DTO com Painel principal (cria se não houver)
CREATE OR REPLACE FUNCTION public.ensure_defensor_work_area(
  p_defensor_user_id uuid,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_count int; v_first uuid; v_lock_key bigint;
  v_panels jsonb; v_access text;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.ensure',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*) INTO v_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  IF v_count = 0 THEN
    INSERT INTO public.defensor_workspaces (defensor_user_id, nome, order_position)
    VALUES (p_defensor_user_id, 'Painel principal', 0)
    RETURNING id INTO v_first;

    INSERT INTO public.defensor_workspace_columns (workspace_id, nome, cor_token, order_position)
    VALUES (v_first, 'Geral', 'neutral', 0);

    PERFORM private.log_audit_event(
      'panel.created','defensor_workspace', v_first::text,
      'sucesso'::public.audit_result, NULL,
      jsonb_build_object('reason','ensure'), NULL, NULL, NULL);
  END IF;

  -- monta DTO
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'nome', w.nome,
      'icone', w.icone,
      'orderPosition', w.order_position,
      'optimisticVersion', w.optimistic_version,
      'updatedAt', w.updated_at
    ) ORDER BY w.order_position), '[]'::jsonb)
    INTO v_panels
    FROM public.defensor_workspaces w
   WHERE w.defensor_user_id = p_defensor_user_id AND w.archived_at IS NULL;

  v_access := CASE WHEN v_actor = p_defensor_user_id THEN 'owner' ELSE 'none' END;

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object(
      'defenderUserId', p_defensor_user_id,
      'activePanelId', (v_panels->0->>'id'),
      'panelCount', jsonb_array_length(v_panels),
      'panels', v_panels,
      'access', jsonb_build_object('accessMode', v_access)
    );
    PERFORM private.complete_idempotency(v_actor,'panel.ensure',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.ensure_defensor_work_area(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_defensor_work_area(uuid, uuid) TO authenticated;

-- ---------- criar_painel ---------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_painel(
  p_defensor_user_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL,
  p_expected_count integer DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_lock_key bigint;
  v_count int; v_pos int; v_id uuid; v_col_id uuid;
  v_name text; v_icon text; v_name_norm text;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_name := private.validate_panel_name(p_nome);
  v_icon := private.validate_panel_icon(p_icone);
  v_name_norm := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*) INTO v_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  IF p_expected_count IS NOT NULL AND p_expected_count <> v_count THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'PANEL_LIMIT_REACHED' USING ERRCODE='23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.defensor_workspaces
              WHERE defensor_user_id = p_defensor_user_id
                AND archived_at IS NULL
                AND nome_normalizado = v_name_norm) THEN
    RAISE EXCEPTION 'PANEL_NAME_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  INSERT INTO public.defensor_workspaces (defensor_user_id, nome, icone, order_position)
  VALUES (p_defensor_user_id, v_name, v_icon, v_pos)
  RETURNING id INTO v_id;

  INSERT INTO public.defensor_workspace_columns (workspace_id, nome, cor_token, order_position)
  VALUES (v_id, 'Geral', 'neutral', 0)
  RETURNING id INTO v_col_id;

  PERFORM private.log_audit_event('panel.created','defensor_workspace',
    v_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('column_id', v_col_id, 'position', v_pos), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object(
      'panelId', v_id, 'initialColumnId', v_col_id,
      'orderPosition', v_pos, 'optimisticVersion', 1);
    PERFORM private.complete_idempotency(v_actor,'panel.create',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid) TO authenticated;

-- ---------- renomear_painel ------------------------------------------
CREATE OR REPLACE FUNCTION public.renomear_painel(
  p_panel_id uuid,
  p_nome text,
  p_icone text,
  p_expected_version bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid; v_curr bigint; v_new bigint;
  v_name text; v_icon text; v_name_norm text;
  v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.rename',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT defensor_user_id, optimistic_version INTO v_owner, v_curr
    FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL
   FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_owner <> v_actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_curr THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  v_name := private.validate_panel_name(p_nome);
  v_icon := CASE WHEN p_icone IS NULL THEN NULL ELSE private.validate_panel_icon(p_icone) END;
  v_name_norm := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));

  IF EXISTS (SELECT 1 FROM public.defensor_workspaces
              WHERE defensor_user_id = v_owner AND archived_at IS NULL
                AND nome_normalizado = v_name_norm AND id <> p_panel_id) THEN
    RAISE EXCEPTION 'PANEL_NAME_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;

  UPDATE public.defensor_workspaces
     SET nome = v_name,
         icone = COALESCE(v_icon, icone),
         optimistic_version = v_curr + 1,
         updated_at = now()
   WHERE id = p_panel_id;
  v_new := v_curr + 1;

  PERFORM private.log_audit_event('panel.renamed','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id, 'optimisticVersion', v_new);
    PERFORM private.complete_idempotency(v_actor,'panel.rename',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.renomear_painel(uuid, text, text, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renomear_painel(uuid, text, text, bigint, uuid) TO authenticated;

-- ---------- reordenar_paineis_defensor -------------------------------
CREATE OR REPLACE FUNCTION public.reordenar_paineis_defensor(
  p_defensor_user_id uuid,
  p_items jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_lock_key bigint;
  v_len int; v_active_count int; v_uniq int;
  v_it jsonb; v_pos int := 0;
  v_pid uuid; v_ver bigint; v_curr bigint; v_owner uuid;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.reorder',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'PANEL_ORDER_INVALID' USING ERRCODE='22023';
  END IF;
  v_len := jsonb_array_length(p_items);
  IF v_len = 0 OR v_len > 8 THEN
    RAISE EXCEPTION 'PANEL_ORDER_INVALID' USING ERRCODE='22023';
  END IF;

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- unicidade
  SELECT count(DISTINCT (e->>'panelId')::uuid) INTO v_uniq
    FROM jsonb_array_elements(p_items) e;
  IF v_uniq <> v_len THEN
    RAISE EXCEPTION 'PANEL_ORDER_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_active_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;
  IF v_active_count <> v_len THEN
    RAISE EXCEPTION 'PANEL_ORDER_INVALID' USING ERRCODE='22023';
  END IF;

  -- valida propriedade e versões
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_it->>'panelId')::uuid;
    v_ver := (v_it->>'expectedVersion')::bigint;
    SELECT defensor_user_id, optimistic_version INTO v_owner, v_curr
      FROM public.defensor_workspaces
     WHERE id = v_pid AND archived_at IS NULL FOR UPDATE;
    IF v_owner IS NULL OR v_owner <> p_defensor_user_id THEN
      RAISE EXCEPTION 'PANEL_ORDER_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_ver IS NOT NULL AND v_ver <> v_curr THEN
      RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
    END IF;
  END LOOP;

  -- 1) desloca todas para posições negativas temporárias
  UPDATE public.defensor_workspaces
     SET order_position = -1 - order_position
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  -- 2) aplica posições finais + bump de versão
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_it->>'panelId')::uuid;
    UPDATE public.defensor_workspaces
       SET order_position = v_pos,
           optimistic_version = optimistic_version + 1,
           updated_at = now()
     WHERE id = v_pid;
    v_pos := v_pos + 1;
  END LOOP;

  PERFORM private.log_audit_event('panel.reordered','defensor_workspace',
    p_defensor_user_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('count', v_len), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('ok', true, 'count', v_len);
    PERFORM private.complete_idempotency(v_actor,'panel.reorder',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.reordenar_paineis_defensor(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_paineis_defensor(uuid, jsonb, uuid) TO authenticated;

-- ---------- arquivar_painel ------------------------------------------
CREATE OR REPLACE FUNCTION public.arquivar_painel(
  p_panel_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_owner uuid; v_curr bigint;
  v_active_count int; v_cards int; v_next uuid;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.archive',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT defensor_user_id, optimistic_version INTO v_owner, v_curr
    FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL
   FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_owner <> v_actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_curr THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('orienta-dpe:panels:'||v_owner::text, 0));

  SELECT count(*) INTO v_active_count FROM public.defensor_workspaces
   WHERE defensor_user_id = v_owner AND archived_at IS NULL;
  IF v_active_count <= 1 THEN
    RAISE EXCEPTION 'LAST_PANEL_CANNOT_BE_DELETED' USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO v_cards FROM public.defensor_workspace_cards WHERE workspace_id = p_panel_id;
  IF v_cards > 0 THEN
    RAISE EXCEPTION 'PANEL_NOT_EMPTY' USING ERRCODE='23514';
  END IF;

  -- arquiva (o índice único parcial libera a posição/nome para reuso)
  UPDATE public.defensor_workspaces
     SET archived_at = now(),
         optimistic_version = v_curr + 1,
         updated_at = now()
   WHERE id = p_panel_id;

  -- reorganiza posições dos restantes: temp negativa + reordena
  UPDATE public.defensor_workspaces
     SET order_position = -1 - order_position
   WHERE defensor_user_id = v_owner AND archived_at IS NULL;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY order_position DESC) - 1 AS pos
      FROM public.defensor_workspaces
     WHERE defensor_user_id = v_owner AND archived_at IS NULL
  )
  UPDATE public.defensor_workspaces d
     SET order_position = r.pos, updated_at = now()
    FROM ranked r WHERE d.id = r.id;

  SELECT id INTO v_next FROM public.defensor_workspaces
   WHERE defensor_user_id = v_owner AND archived_at IS NULL
   ORDER BY order_position LIMIT 1;

  PERFORM private.log_audit_event('panel.archived','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id, 'nextActivePanelId', v_next);
    PERFORM private.complete_idempotency(v_actor,'panel.archive',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $$;

REVOKE ALL ON FUNCTION public.arquivar_painel(uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivar_painel(uuid, bigint, uuid) TO authenticated;

-- ---------- Compat: ensure_defensor_workspace / listar_workspace_completo
-- Mantidas temporariamente para o frontend do Turno 3.A funcionar até
-- o Turno 3.B substituir as chamadas.
CREATE OR REPLACE FUNCTION public.ensure_defensor_workspace(
  p_defensor_user_id uuid,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_area jsonb;
BEGIN
  v_area := public.ensure_defensor_work_area(p_defensor_user_id, p_idempotency_key);
  RETURN (v_area->>'activePanelId')::uuid;
END $$;
REVOKE ALL ON FUNCTION public.ensure_defensor_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_defensor_workspace(uuid, uuid) TO authenticated;
