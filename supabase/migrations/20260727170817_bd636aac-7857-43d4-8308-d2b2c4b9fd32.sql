
-- ==========================================================================
-- Sub-gate 4.1.b · Turno 3 — Workspaces, colunas e cards
-- ==========================================================================

-- 0. CONSOLIDAÇÃO: um workspace principal por Defensor -----------------------
-- Há 1 defensor com múltiplos workspaces (ambos sem colunas/cards). Mantém o
-- mais antigo e remove os demais.
WITH ranked AS (
  SELECT id, defensor_user_id,
         row_number() OVER (PARTITION BY defensor_user_id ORDER BY created_at) AS rn
    FROM public.defensor_workspaces
)
DELETE FROM public.defensor_workspaces w
 USING ranked r
 WHERE w.id = r.id AND r.rn > 1;

-- 1. WORKSPACES --------------------------------------------------------------
ALTER TABLE public.defensor_workspaces
  ALTER COLUMN orgao_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS optimistic_version bigint NOT NULL DEFAULT 1;

-- índices antigos que assumiam (defensor,orgao) na identidade
DROP INDEX IF EXISTS public.defensor_workspaces_defensor_orgao_nome_key;
DROP INDEX IF EXISTS public.uq_defensor_workspaces_defensor_orgao_nome;
DROP INDEX IF EXISTS public.idx_defensor_workspaces_defensor_orgao;

-- unicidade: um workspace ativo por defensor
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_workspace_per_defender
  ON public.defensor_workspaces (defensor_user_id)
  WHERE archived_at IS NULL;

-- 2. COLUMNS -----------------------------------------------------------------
ALTER TABLE public.defensor_workspace_columns
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS cor_token public.workspace_color_enum NOT NULL DEFAULT 'neutral';

-- validação de custom color (hex #RRGGBB)
ALTER TABLE public.defensor_workspace_columns
  DROP CONSTRAINT IF EXISTS defensor_workspace_columns_cor_hex_ck;
ALTER TABLE public.defensor_workspace_columns
  ADD CONSTRAINT defensor_workspace_columns_cor_hex_ck
    CHECK (cor IS NULL OR cor ~ '^#[0-9a-fA-F]{6}$');

-- composite unique (id, workspace_id) para permitir FK composta em cards
ALTER TABLE public.defensor_workspace_columns
  DROP CONSTRAINT IF EXISTS defensor_workspace_columns_id_workspace_key;
ALTER TABLE public.defensor_workspace_columns
  ADD CONSTRAINT defensor_workspace_columns_id_workspace_key UNIQUE (id, workspace_id);

-- ordem única por workspace (deferível para permitir swaps atômicos)
ALTER TABLE public.defensor_workspace_columns
  DROP CONSTRAINT IF EXISTS defensor_workspace_columns_order_key;
ALTER TABLE public.defensor_workspace_columns
  ADD CONSTRAINT defensor_workspace_columns_order_key
    UNIQUE (workspace_id, order_position) DEFERRABLE INITIALLY DEFERRED;

-- 3. CARDS -------------------------------------------------------------------
-- adiciona workspace_id (backfill vazio, mas se houver algum card fará match)
ALTER TABLE public.defensor_workspace_cards
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.defensor_workspace_cards k
   SET workspace_id = c.workspace_id
  FROM public.defensor_workspace_columns c
 WHERE k.column_id = c.id AND k.workspace_id IS NULL;

ALTER TABLE public.defensor_workspace_cards
  ALTER COLUMN workspace_id SET NOT NULL;

-- remove FK antiga (só para column_id) e substitui por FK composta
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.defensor_workspace_cards'::regclass
       AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.defensor_workspace_cards DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $do$;

ALTER TABLE public.defensor_workspace_cards
  ADD CONSTRAINT defensor_workspace_cards_column_ws_fk
    FOREIGN KEY (column_id, workspace_id)
    REFERENCES public.defensor_workspace_columns (id, workspace_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT defensor_workspace_cards_item_fk
    FOREIGN KEY (item_id) REFERENCES public.content_items (id) ON DELETE RESTRICT,
  ADD CONSTRAINT defensor_workspace_cards_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES public.defensor_workspaces (id) ON DELETE RESTRICT;

-- remove campo note (não deve haver conteúdo livre nos cards)
ALTER TABLE public.defensor_workspace_cards
  DROP COLUMN IF EXISTS note;

-- unicidade: mesmo item aparece no máximo uma vez por workspace
ALTER TABLE public.defensor_workspace_cards
  DROP CONSTRAINT IF EXISTS defensor_workspace_cards_workspace_item_key;
ALTER TABLE public.defensor_workspace_cards
  ADD CONSTRAINT defensor_workspace_cards_workspace_item_key
    UNIQUE (workspace_id, item_id);

-- ordem única por coluna (deferível)
ALTER TABLE public.defensor_workspace_cards
  DROP CONSTRAINT IF EXISTS defensor_workspace_cards_column_order_key;
ALTER TABLE public.defensor_workspace_cards
  ADD CONSTRAINT defensor_workspace_cards_column_order_key
    UNIQUE (column_id, order_position) DEFERRABLE INITIALLY DEFERRED;

-- trigger: impede alterar item_id / workspace_id após inserção (imutável)
CREATE OR REPLACE FUNCTION private.tg_workspace_cards_immutable_ref()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.item_id <> OLD.item_id THEN
    RAISE EXCEPTION 'CARD_ITEM_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id <> OLD.workspace_id THEN
    RAISE EXCEPTION 'CARD_WORKSPACE_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS defensor_workspace_cards_immutable_ref ON public.defensor_workspace_cards;
CREATE TRIGGER defensor_workspace_cards_immutable_ref
BEFORE UPDATE ON public.defensor_workspace_cards
FOR EACH ROW EXECUTE FUNCTION private.tg_workspace_cards_immutable_ref();

-- 4. REVOGAR MUTAÇÕES DIRETAS -----------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspaces           FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspace_columns    FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.defensor_workspace_cards      FROM PUBLIC, anon, authenticated;
GRANT  SELECT                  ON public.defensor_workspaces          TO authenticated;
GRANT  SELECT                  ON public.defensor_workspace_columns   TO authenticated;
GRANT  SELECT                  ON public.defensor_workspace_cards     TO authenticated;
GRANT  ALL                     ON public.defensor_workspaces          TO service_role;
GRANT  ALL                     ON public.defensor_workspace_columns   TO service_role;
GRANT  ALL                     ON public.defensor_workspace_cards     TO service_role;

-- 5. HELPER: acesso ---------------------------------------------------------
CREATE OR REPLACE FUNCTION private.user_workspace_access(p_user uuid, p_workspace_id uuid)
RETURNS TABLE (
  can_view boolean,
  can_edit_workspace boolean,
  can_manage_columns boolean,
  can_move_cards boolean,
  can_add_items boolean,
  access_mode text,
  defensor_user_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_def uuid;
  v_role public.app_role;
  v_ctx_defensor uuid;
BEGIN
  SELECT w.defensor_user_id INTO v_def
    FROM public.defensor_workspaces w
   WHERE w.id = p_workspace_id AND w.archived_at IS NULL;
  IF v_def IS NULL THEN
    RETURN QUERY SELECT false,false,false,false,false,'none'::text,NULL::uuid;
    RETURN;
  END IF;

  -- proprietário
  IF v_def = p_user AND private.user_is_active_defensor(p_user) THEN
    RETURN QUERY SELECT true,true,true,true,true,'owner'::text, v_def;
    RETURN;
  END IF;

  -- admin técnico: somente leitura técnica
  IF private.current_user_has_role('admin_tecnico') THEN
    RETURN QUERY SELECT true,false,false,false,false,'technical_readonly'::text, v_def;
    RETURN;
  END IF;

  -- membro de equipe: exige vínculo ativo + contexto atual apontando p/ o defensor
  SELECT dc.defensor_user_id INTO v_ctx_defensor
    FROM public.defensor_context dc WHERE dc.user_id = p_user;

  IF private.user_is_active_team_member(p_user)
     AND private.active_member_defensor_bond_exists(p_user, v_def)
     AND v_ctx_defensor = v_def THEN
    RETURN QUERY SELECT true,false,false,false,false,'team_readonly'::text, v_def;
    RETURN;
  END IF;

  RETURN QUERY SELECT false,false,false,false,false,'none'::text, v_def;
END $fn$;

REVOKE ALL ON FUNCTION private.user_workspace_access(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- 6. HELPER: bump de versão otimista ----------------------------------------
CREATE OR REPLACE FUNCTION private.bump_workspace_version(
  p_workspace_id uuid,
  p_expected     bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_current bigint;
BEGIN
  SELECT optimistic_version INTO v_current
    FROM public.defensor_workspaces
   WHERE id = p_workspace_id
   FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected IS NOT NULL AND p_expected <> v_current THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE = '40001';
  END IF;
  UPDATE public.defensor_workspaces
     SET optimistic_version = v_current + 1, updated_at = now()
   WHERE id = p_workspace_id;
  RETURN v_current + 1;
END $fn$;

REVOKE ALL ON FUNCTION private.bump_workspace_version(uuid,bigint) FROM PUBLIC, anon, authenticated;

-- 7. DROPS DE RPCS OBSOLETAS -----------------------------------------------
DROP FUNCTION IF EXISTS public.criar_workspace_defensor(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.excluir_workspace_defensor(uuid);
DROP FUNCTION IF EXISTS public.reordenar_workspaces_defensor(uuid,uuid,uuid[]);
DROP FUNCTION IF EXISTS public.renomear_workspace_defensor(uuid,text,text);
DROP FUNCTION IF EXISTS public.listar_workspaces_defensor(uuid,uuid);
DROP FUNCTION IF EXISTS public.criar_coluna_workspace(uuid,text,text);
DROP FUNCTION IF EXISTS public.atualizar_coluna_workspace(uuid,text,text);
DROP FUNCTION IF EXISTS public.excluir_coluna_workspace(uuid);
DROP FUNCTION IF EXISTS public.adicionar_card_workspace(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.atualizar_card_workspace(uuid,text);
DROP FUNCTION IF EXISTS public.mover_card_workspace(uuid,uuid,integer);
DROP FUNCTION IF EXISTS public.remover_card_workspace(uuid);
DROP FUNCTION IF EXISTS public.listar_cards_coluna(uuid);
DROP FUNCTION IF EXISTS public.listar_colunas_workspace(uuid);

-- 8. RPC: ensure_defensor_workspace ----------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_defensor_workspace(
  p_defensor_user_id uuid,
  p_idempotency_key  uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_replay jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT private.user_is_active_defensor(v_actor) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor, 'workspace.ensure', p_idempotency_key);
  IF v_replay IS NOT NULL THEN
    RETURN (v_replay->'result'->>'workspace_id')::uuid;
  END IF;

  SELECT id INTO v_id
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id
     AND archived_at IS NULL
   FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.defensor_workspaces (defensor_user_id, nome, order_position)
    VALUES (p_defensor_user_id, 'Minha Área de Trabalho', 0)
    RETURNING id INTO v_id;

    INSERT INTO public.defensor_workspace_columns (workspace_id, nome, cor_token, order_position)
    VALUES (v_id, 'A fazer', 'neutral', 0);

    PERFORM private.log_audit_event(
      'workspace.created','defensor_workspace', v_id::text,
      'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL
    );
  END IF;

  PERFORM private.complete_idempotency(v_actor,'workspace.ensure',p_idempotency_key,
                                       jsonb_build_object('workspace_id', v_id));
  RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION public.ensure_defensor_workspace(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_defensor_workspace(uuid,uuid) TO authenticated;

-- 9. RPC: atualizar_workspace_defensor -------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_workspace_defensor(
  p_workspace_id                uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid,
  p_nome                        text,
  p_icone                       text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record; v_new bigint; v_replay jsonb;
BEGIN
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_workspace_id);
  IF NOT v_acc.can_edit_workspace THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.update',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'version')::bigint; END IF;

  v_new := private.bump_workspace_version(p_workspace_id, p_expected_workspace_version);

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023';
  END IF;

  UPDATE public.defensor_workspaces
     SET nome = trim(p_nome), icone = COALESCE(p_icone, icone)
   WHERE id = p_workspace_id;

  PERFORM private.log_audit_event('workspace.updated','defensor_workspace',
    p_workspace_id::text,'sucesso'::public.audit_result,NULL,NULL,NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.update',p_idempotency_key,
                                       jsonb_build_object('version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.atualizar_workspace_defensor(uuid,bigint,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_workspace_defensor(uuid,bigint,uuid,text,text) TO authenticated;

-- 10. RPC: criar_coluna_workspace ------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_coluna_workspace(
  p_workspace_id                uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid,
  p_nome                        text,
  p_descricao                   text DEFAULT NULL,
  p_cor_token                   public.workspace_color_enum DEFAULT 'neutral',
  p_cor_custom                  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_acc record; v_new bigint; v_id uuid; v_pos int;
  v_replay jsonb;
BEGIN
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_workspace_id);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023';
  END IF;
  IF p_cor_custom IS NOT NULL AND p_cor_custom !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOR' USING ERRCODE='22023';
  END IF;

  v_new := private.bump_workspace_version(p_workspace_id, p_expected_workspace_version);

  SELECT COALESCE(max(order_position),-1)+1 INTO v_pos
    FROM public.defensor_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO public.defensor_workspace_columns
    (workspace_id, nome, descricao, cor_token, cor, order_position)
  VALUES (p_workspace_id, trim(p_nome), nullif(trim(coalesce(p_descricao,'')),''),
          p_cor_token, p_cor_custom, v_pos)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('workspace.column_created','defensor_workspace_column',
    v_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', p_workspace_id),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.create',p_idempotency_key,
    jsonb_build_object('column_id', v_id, 'workspace_version', v_new));
  RETURN jsonb_build_object('column_id', v_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.criar_coluna_workspace(uuid,bigint,uuid,text,text,public.workspace_color_enum,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_coluna_workspace(uuid,bigint,uuid,text,text,public.workspace_color_enum,text) TO authenticated;

-- 11. RPC: atualizar_coluna_workspace --------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_coluna_workspace(
  p_column_id                   uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid,
  p_nome                        text,
  p_descricao                   text DEFAULT NULL,
  p_cor_token                   public.workspace_color_enum DEFAULT 'neutral',
  p_cor_custom                  text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_replay jsonb;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.update',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;
  IF p_cor_custom IS NOT NULL AND p_cor_custom !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOR' USING ERRCODE='22023';
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  UPDATE public.defensor_workspace_columns
     SET nome = trim(p_nome),
         descricao = nullif(trim(coalesce(p_descricao,'')),''),
         cor_token = p_cor_token,
         cor = p_cor_custom,
         updated_at = now()
   WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_updated','defensor_workspace_column',
    p_column_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.update',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.atualizar_coluna_workspace(uuid,bigint,uuid,text,text,public.workspace_color_enum,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_coluna_workspace(uuid,bigint,uuid,text,text,public.workspace_color_enum,text) TO authenticated;

-- 12. RPC: mover_coluna_workspace ------------------------------------------
CREATE OR REPLACE FUNCTION public.mover_coluna_workspace(
  p_column_id                   uuid,
  p_direction                   text,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_replay jsonb;
  v_pos int; v_other_id uuid; v_other_pos int;
BEGIN
  IF p_direction NOT IN ('left','right') THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE='22023';
  END IF;
  SELECT workspace_id, order_position INTO v_ws, v_pos
    FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.move',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  IF p_direction = 'left' THEN
    SELECT id, order_position INTO v_other_id, v_other_pos
      FROM public.defensor_workspace_columns
     WHERE workspace_id = v_ws AND order_position < v_pos
     ORDER BY order_position DESC LIMIT 1;
  ELSE
    SELECT id, order_position INTO v_other_id, v_other_pos
      FROM public.defensor_workspace_columns
     WHERE workspace_id = v_ws AND order_position > v_pos
     ORDER BY order_position ASC LIMIT 1;
  END IF;
  IF v_other_id IS NULL THEN RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE='22023'; END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  -- swap via posição temporária (constraint deferível)
  UPDATE public.defensor_workspace_columns SET order_position = -1 WHERE id = p_column_id;
  UPDATE public.defensor_workspace_columns SET order_position = v_pos WHERE id = v_other_id;
  UPDATE public.defensor_workspace_columns SET order_position = v_other_pos WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.columns_reordered','defensor_workspace',
    v_ws::text,'sucesso'::public.audit_result,NULL,NULL,NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.move',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.mover_coluna_workspace(uuid,text,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_coluna_workspace(uuid,text,bigint,uuid) TO authenticated;

-- 13. RPC: excluir_coluna_workspace ----------------------------------------
CREATE OR REPLACE FUNCTION public.excluir_coluna_workspace(
  p_column_id                   uuid,
  p_destination_column_id       uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_dest_ws uuid; v_acc record;
  v_cnt int; v_total int; v_new bigint; v_replay jsonb; v_dest_pos int; v_shift int;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.delete',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  SELECT count(*) INTO v_total FROM public.defensor_workspace_columns WHERE workspace_id = v_ws;
  IF v_total <= 1 THEN RAISE EXCEPTION 'LAST_WORKSPACE_COLUMN' USING ERRCODE='23514'; END IF;

  SELECT count(*) INTO v_cnt FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  IF v_cnt > 0 THEN
    IF p_destination_column_id IS NULL OR p_destination_column_id = p_column_id THEN
      RAISE EXCEPTION 'COLUMN_NOT_EMPTY' USING ERRCODE='23514';
    END IF;
    SELECT workspace_id INTO v_dest_ws FROM public.defensor_workspace_columns
      WHERE id = p_destination_column_id;
    IF v_dest_ws IS NULL OR v_dest_ws <> v_ws THEN
      RAISE EXCEPTION 'COLUMN_WORKSPACE_MISMATCH' USING ERRCODE='23514';
    END IF;
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  IF v_cnt > 0 THEN
    SELECT COALESCE(max(order_position),-1)+1 INTO v_dest_pos
      FROM public.defensor_workspace_cards WHERE column_id = p_destination_column_id;
    -- transfere preservando ordem relativa
    UPDATE public.defensor_workspace_cards
       SET column_id = p_destination_column_id,
           order_position = v_dest_pos + order_position,
           updated_at = now()
     WHERE column_id = p_column_id;
  END IF;

  DELETE FROM public.defensor_workspace_columns WHERE id = p_column_id;

  -- reordena posições restantes (0..n-1) sem violar unique deferível
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY order_position) - 1 AS pos
      FROM public.defensor_workspace_columns WHERE workspace_id = v_ws
  )
  UPDATE public.defensor_workspace_columns c
     SET order_position = r.pos
    FROM ranked r WHERE c.id = r.id AND c.order_position <> r.pos;

  PERFORM private.log_audit_event('workspace.column_deleted','defensor_workspace_column',
    p_column_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'moved_cards', v_cnt),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.delete',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.excluir_coluna_workspace(uuid,uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_coluna_workspace(uuid,uuid,bigint,uuid) TO authenticated;

-- 14. RPC: adicionar_card_workspace ----------------------------------------
CREATE OR REPLACE FUNCTION public.adicionar_card_workspace(
  p_column_id                   uuid,
  p_item_id                     uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_id uuid; v_pos int;
  v_owner uuid; v_status public.content_status; v_vis public.content_visibility;
  v_replay jsonb;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_add_items THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.card.add',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT owner_user_id, status, visibility INTO v_owner, v_status, v_vis
    FROM public.content_items WHERE id = p_item_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  -- importação (não-proprietário): exige publicado e visibilidade compatível
  IF v_owner <> v_acc.defensor_user_id THEN
    IF v_status <> 'publicado' THEN RAISE EXCEPTION 'ITEM_NOT_PUBLISHED' USING ERRCODE='22023'; END IF;
    IF v_vis = 'privado' THEN RAISE EXCEPTION 'ITEM_NOT_VISIBLE' USING ERRCODE='42501'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.defensor_workspace_cards
              WHERE workspace_id = v_ws AND item_id = p_item_id) THEN
    RAISE EXCEPTION 'ITEM_ALREADY_IN_WORKSPACE' USING ERRCODE='23505';
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  SELECT COALESCE(max(order_position),-1)+1 INTO v_pos
    FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  INSERT INTO public.defensor_workspace_cards (column_id, workspace_id, item_id, order_position)
  VALUES (p_column_id, v_ws, p_item_id, v_pos)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('workspace.card_added','defensor_workspace_card',
    v_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'column_id', p_column_id, 'item_id', p_item_id),
    NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.card.add',p_idempotency_key,
    jsonb_build_object('card_id', v_id, 'workspace_version', v_new));
  RETURN jsonb_build_object('card_id', v_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.adicionar_card_workspace(uuid,uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_card_workspace(uuid,uuid,bigint,uuid) TO authenticated;

-- 15. RPC: mover_card_workspace --------------------------------------------
CREATE OR REPLACE FUNCTION public.mover_card_workspace(
  p_card_id                     uuid,
  p_target_column_id            uuid,
  p_new_position                integer,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_src_col uuid; v_dst_ws uuid; v_src_pos int;
  v_acc record; v_new bigint; v_replay jsonb; v_max int;
BEGIN
  SELECT workspace_id, column_id, order_position
    INTO v_ws, v_src_col, v_src_pos
    FROM public.defensor_workspace_cards WHERE id = p_card_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT workspace_id INTO v_dst_ws
    FROM public.defensor_workspace_columns WHERE id = p_target_column_id;
  IF v_dst_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_dst_ws <> v_ws THEN RAISE EXCEPTION 'COLUMN_WORKSPACE_MISMATCH' USING ERRCODE='23514'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_move_cards THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.card.move',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  -- 1) tira o card da coluna de origem posicionando temporariamente
  UPDATE public.defensor_workspace_cards
     SET order_position = -1000000, updated_at = now()
   WHERE id = p_card_id;

  -- 2) fecha o buraco na origem
  UPDATE public.defensor_workspace_cards
     SET order_position = order_position - 1
   WHERE column_id = v_src_col AND order_position > v_src_pos AND id <> p_card_id;

  -- 3) abre espaço no destino
  SELECT count(*) INTO v_max FROM public.defensor_workspace_cards WHERE column_id = p_target_column_id AND id <> p_card_id;
  IF p_new_position < 0 THEN p_new_position := 0; END IF;
  IF p_new_position > v_max THEN p_new_position := v_max; END IF;

  UPDATE public.defensor_workspace_cards
     SET order_position = order_position + 1
   WHERE column_id = p_target_column_id
     AND order_position >= p_new_position
     AND id <> p_card_id;

  -- 4) posiciona o card
  UPDATE public.defensor_workspace_cards
     SET column_id = p_target_column_id, order_position = p_new_position, updated_at = now()
   WHERE id = p_card_id;

  PERFORM private.log_audit_event('workspace.card_moved','defensor_workspace_card',
    p_card_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'from_column', v_src_col, 'to_column', p_target_column_id, 'to_pos', p_new_position),
    NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.card.move',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.mover_card_workspace(uuid,uuid,integer,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_card_workspace(uuid,uuid,integer,bigint,uuid) TO authenticated;

-- 16. RPC: remover_card_workspace ------------------------------------------
CREATE OR REPLACE FUNCTION public.remover_card_workspace(
  p_card_id                     uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_col uuid; v_pos int;
  v_acc record; v_new bigint; v_replay jsonb;
BEGIN
  SELECT workspace_id, column_id, order_position INTO v_ws, v_col, v_pos
    FROM public.defensor_workspace_cards WHERE id = p_card_id;
  IF v_ws IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_move_cards THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.card.remove',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  DELETE FROM public.defensor_workspace_cards WHERE id = p_card_id;

  UPDATE public.defensor_workspace_cards
     SET order_position = order_position - 1
   WHERE column_id = v_col AND order_position > v_pos;

  PERFORM private.log_audit_event('workspace.card_removed','defensor_workspace_card',
    p_card_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws, 'column_id', v_col),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.card.remove',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.remover_card_workspace(uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_card_workspace(uuid,bigint,uuid) TO authenticated;

-- 17. RPC: listar_workspace_completo ---------------------------------------
-- Retorna workspace + colunas + cards em DTO mínimo, com flags de permissão.
CREATE OR REPLACE FUNCTION public.listar_workspace_completo(
  p_defensor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_ws_id uuid;
  v_ws record;
  v_acc record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_ws
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;
  IF v_ws.id IS NULL THEN
    RETURN jsonb_build_object('workspace', NULL, 'access',
      jsonb_build_object('accessMode','none','canEditWorkspace',false,
        'canManageColumns',false,'canMoveCards',false,'canAddItems',false));
  END IF;
  v_ws_id := v_ws.id;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws_id);
  IF NOT v_acc.can_view THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
    'corToken', c.cor_token, 'corCustom', c.cor,
    'orderPosition', c.order_position
  ) ORDER BY c.order_position), '[]'::jsonb) INTO v_columns
    FROM public.defensor_workspace_columns c WHERE c.workspace_id = v_ws_id;

  WITH raw AS (
    SELECT k.id, k.column_id, k.item_id, k.order_position, k.updated_at,
           i.kind, i.owner_user_id, i.status,
           v.title, v.version_number,
           pv.title AS pub_title, pv.version_number AS pub_version,
           cat.nome AS categoria,
           pr.nome_completo AS owner_name
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_versions pv ON pv.id = i.current_published_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.profiles pr ON pr.user_id = i.owner_user_id
     WHERE k.workspace_id = v_ws_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cardId',       r.id,
    'workspaceId',  v_ws_id,
    'columnId',     r.column_id,
    'itemId',       r.item_id,
    'kind',         r.kind,
    'placement',    CASE WHEN r.owner_user_id = v_acc.defensor_user_id THEN 'owned' ELSE 'imported' END,
    'title',        COALESCE(r.pub_title, r.title, '(sem título)'),
    'description',  NULL,
    'categoryNames', CASE WHEN r.categoria IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(r.categoria) END,
    'ownerDisplayName', COALESCE(r.owner_name, ''),
    'status',       r.status,
    'publishedVersionNumber', r.pub_version,
    'updatedAt',    r.updated_at,
    'archivedByAuthor', (r.status = 'arquivado'),
    'orderPosition', r.order_position,
    'canOpen', (
      -- membro em modo leitura não vê rascunho de outros; owner vê tudo
      (v_acc.access_mode = 'owner')
      OR (r.status = 'publicado')
      OR (r.status = 'arquivado' AND r.pub_version IS NOT NULL)
    ),
    'canEdit', (v_acc.access_mode = 'owner' AND r.owner_user_id = v_acc.defensor_user_id),
    'canUse',  (
      (r.status = 'publicado')
      OR (v_acc.access_mode = 'owner' AND r.status <> 'arquivado')
    )
  ) ORDER BY r.order_position), '[]'::jsonb) INTO v_cards FROM raw r;

  RETURN jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id,
      'defensorUserId', v_ws.defensor_user_id,
      'nome', v_ws.nome,
      'icone', v_ws.icone,
      'optimisticVersion', v_ws.optimistic_version,
      'updatedAt', v_ws.updated_at
    ),
    'access', jsonb_build_object(
      'accessMode', v_acc.access_mode,
      'canEditWorkspace', v_acc.can_edit_workspace,
      'canManageColumns', v_acc.can_manage_columns,
      'canMoveCards', v_acc.can_move_cards,
      'canAddItems', v_acc.can_add_items
    ),
    'columns', v_columns,
    'cards', v_cards
  );
END $fn$;

REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid) TO authenticated;
