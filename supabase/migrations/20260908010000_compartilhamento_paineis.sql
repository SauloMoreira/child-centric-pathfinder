-- COMPARTILHAMENTO DE PAINÉIS
-- Painéis podem ser tornados públicos pelo Defensor Público que os criou
-- (o "gestor"). Painéis públicos podem ser encontrados na Biblioteca e
-- importados por qualquer usuário, que passa a ser "visitante" (acesso
-- somente leitura). O gestor pode promover visitantes/qualquer usuário a
-- "colaborador" (pode organizar colunas e cards, mas não excluir o painel).
-- Painéis privados não podem ter colaboradores nem visitantes.

-- ============================================================
-- 1) Colunas novas em defensor_workspaces: visibilidade e descrição
-- ============================================================
ALTER TABLE public.defensor_workspaces
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descricao text NULL;

ALTER TABLE public.defensor_workspaces
  DROP CONSTRAINT IF EXISTS defensor_workspaces_descricao_length;
ALTER TABLE public.defensor_workspaces
  ADD CONSTRAINT defensor_workspaces_descricao_length
  CHECK (descricao IS NULL OR char_length(descricao) <= 500);

-- ============================================================
-- 2) Tabela de vínculos (visitante/colaborador) por painel
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.defensor_workspaces(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('visitante','colaborador')),
  added_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_member_idx ON public.workspace_members(member_user_id);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON public.workspace_members(workspace_id);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso exclusivamente via funções SECURITY DEFINER abaixo.
REVOKE ALL ON public.workspace_members FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3) Validação de descrição de painel (mesmo padrão de nome/ícone)
-- ============================================================
CREATE OR REPLACE FUNCTION private.validate_panel_description(p_descricao text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE v text;
BEGIN
  v := nullif(btrim(coalesce(p_descricao,'')), '');
  IF v IS NULL THEN RETURN NULL; END IF;
  IF char_length(v) > 500 THEN
    RAISE EXCEPTION 'INVALID_DESCRIPTION' USING ERRCODE='22023';
  END IF;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION private.validate_panel_description(text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4) private.user_workspace_access — fonte única de verdade de acesso
--    Agora também cobre colaborador/visitante e expõe can_delete_workspace.
-- ============================================================
DROP FUNCTION IF EXISTS private.user_workspace_access(uuid, uuid);

CREATE FUNCTION private.user_workspace_access(p_user uuid, p_workspace_id uuid)
 RETURNS TABLE(
   can_view boolean,
   can_edit_workspace boolean,
   can_manage_columns boolean,
   can_move_cards boolean,
   can_add_items boolean,
   can_delete_workspace boolean,
   access_mode text,
   defensor_user_id uuid
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_def uuid;
  v_ctx_defensor uuid;
  v_member_role text;
BEGIN
  SELECT w.defensor_user_id INTO v_def
    FROM public.defensor_workspaces w
   WHERE w.id = p_workspace_id AND w.archived_at IS NULL;
  IF v_def IS NULL THEN
    RETURN QUERY SELECT false,false,false,false,false,false,'none'::text,NULL::uuid;
    RETURN;
  END IF;

  IF v_def = p_user AND private.user_is_active_defensor(p_user) THEN
    RETURN QUERY SELECT true,true,true,true,true,true,'owner'::text, v_def;
    RETURN;
  END IF;

  -- Administrador Técnico: acesso administrativo completo
  IF private.current_user_has_role('admin_tecnico') THEN
    RETURN QUERY SELECT true,true,true,true,true,true,'technical_admin'::text, v_def;
    RETURN;
  END IF;

  SELECT dc.defensor_user_id INTO v_ctx_defensor
    FROM public.defensor_context dc WHERE dc.user_id = p_user;

  IF private.user_is_active_team_member(p_user)
     AND private.active_member_defensor_bond_exists(p_user, v_def)
     AND v_ctx_defensor = v_def THEN
    RETURN QUERY SELECT true,false,false,false,false,false,'team_readonly'::text, v_def;
    RETURN;
  END IF;

  -- Compartilhamento de painéis: colaborador ou visitante
  SELECT m.role INTO v_member_role
    FROM public.workspace_members m
   WHERE m.workspace_id = p_workspace_id AND m.member_user_id = p_user;

  IF v_member_role = 'colaborador' THEN
    RETURN QUERY SELECT true,true,true,true,true,false,'collaborator'::text, v_def;
    RETURN;
  ELSIF v_member_role = 'visitante' THEN
    RETURN QUERY SELECT true,false,false,false,false,false,'visitor'::text, v_def;
    RETURN;
  END IF;

  RETURN QUERY SELECT false,false,false,false,false,false,'none'::text, v_def;
END $function$;

REVOKE ALL ON FUNCTION private.user_workspace_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.can_view_workspace(p_user uuid, p_ws uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((SELECT can_view FROM private.user_workspace_access(p_user, p_ws)), false);
$function$;

-- ============================================================
-- 5) criar_painel / renomear_painel — descrição e visibilidade
-- ============================================================
DROP FUNCTION IF EXISTS public.criar_painel(uuid, text, text, integer, uuid);

CREATE FUNCTION public.criar_painel(
  p_defensor_user_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL::text,
  p_expected_count integer DEFAULT NULL::integer,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_descricao text DEFAULT NULL::text,
  p_is_public boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_replay jsonb; v_lock_key bigint;
  v_count int; v_pos int; v_id uuid;
  v_name text; v_icon text; v_name_norm text; v_desc text;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);
  IF p_defensor_user_id <> v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_replay := private.claim_idempotency(v_actor,'panel.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  v_name := private.validate_panel_name(p_nome);
  v_icon := private.validate_panel_icon(p_icone);
  v_desc := private.validate_panel_description(p_descricao);
  v_name_norm := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));

  v_lock_key := hashtextextended('orienta-dpe:panels:'||p_defensor_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*) INTO v_count FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  IF p_expected_count IS NOT NULL AND p_expected_count <> v_count THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  -- Ajuste doc (AJUSTE 13) — limite de 8 Painéis removido por completo.

  IF EXISTS (SELECT 1 FROM public.defensor_workspaces
              WHERE defensor_user_id = p_defensor_user_id
                AND archived_at IS NULL
                AND nome_normalizado = v_name_norm) THEN
    RAISE EXCEPTION 'PANEL_NAME_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL;

  INSERT INTO public.defensor_workspaces
    (defensor_user_id, nome, icone, order_position, descricao, is_public)
  VALUES (p_defensor_user_id, v_name, v_icon, v_pos, v_desc, COALESCE(p_is_public, false))
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('panel.created','defensor_workspace',
    v_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('position', v_pos, 'isPublic', COALESCE(p_is_public, false)), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object(
      'panelId', v_id, 'initialColumnId', NULL,
      'orderPosition', v_pos, 'optimisticVersion', 1);
    PERFORM private.complete_idempotency(v_actor,'panel.create',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_painel(uuid, text, text, integer, uuid, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.renomear_painel(uuid, text, text, bigint, uuid);

CREATE FUNCTION public.renomear_painel(
  p_panel_id uuid,
  p_nome text,
  p_icone text,
  p_expected_version bigint,
  p_idempotency_key uuid,
  p_descricao text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid; v_curr bigint; v_new bigint;
  v_name text; v_icon text; v_name_norm text; v_desc text; v_desc_provided boolean;
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

  -- descrição é opcional na chamada; NULL explícito de propósito limpa o campo.
  -- Como não há como distinguir "não informado" de "quero limpar" com um único
  -- texto, o cliente sempre envia a descrição vigente (ou string vazia).
  v_desc := private.validate_panel_description(p_descricao);

  UPDATE public.defensor_workspaces
     SET nome = v_name,
         icone = COALESCE(v_icon, icone),
         descricao = v_desc,
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
END $function$;

REVOKE ALL ON FUNCTION public.renomear_painel(uuid, text, text, bigint, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renomear_painel(uuid, text, text, bigint, uuid, text) TO authenticated;

-- ============================================================
-- 6) definir_visibilidade_painel — tornar público/privado (só o gestor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.definir_visibilidade_painel(
  p_panel_id uuid,
  p_is_public boolean,
  p_expected_version bigint,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid; v_curr bigint; v_new bigint; v_replay jsonb; v_removed int;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.visibility.set',p_idempotency_key);
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

  v_removed := 0;
  IF NOT p_is_public THEN
    -- Painéis privados não podem ter colaboradores/visitantes.
    WITH deleted AS (
      DELETE FROM public.workspace_members WHERE workspace_id = p_panel_id RETURNING 1
    )
    SELECT count(*) INTO v_removed FROM deleted;
  END IF;

  UPDATE public.defensor_workspaces
     SET is_public = p_is_public,
         optimistic_version = v_curr + 1,
         updated_at = now()
   WHERE id = p_panel_id;
  v_new := v_curr + 1;

  PERFORM private.log_audit_event('panel.visibility_changed','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('isPublic', p_is_public, 'membersRemoved', v_removed), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id, 'optimisticVersion', v_new, 'isPublic', p_is_public);
    PERFORM private.complete_idempotency(v_actor,'panel.visibility.set',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.definir_visibilidade_painel(uuid, boolean, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_visibilidade_painel(uuid, boolean, bigint, uuid) TO authenticated;

-- ============================================================
-- 7) importar_painel / remover_painel_importado (visitante)
-- ============================================================
CREATE OR REPLACE FUNCTION public.importar_painel(
  p_panel_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid; v_public boolean; v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.import',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT defensor_user_id, is_public INTO v_owner, v_public
    FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT v_public THEN RAISE EXCEPTION 'PANEL_NOT_PUBLIC' USING ERRCODE='42501'; END IF;
  IF v_owner = v_actor THEN RAISE EXCEPTION 'CANNOT_IMPORT_OWN_PANEL' USING ERRCODE='22023'; END IF;

  INSERT INTO public.workspace_members (workspace_id, member_user_id, role, added_by)
  VALUES (p_panel_id, v_actor, 'visitante', v_actor)
  ON CONFLICT (workspace_id, member_user_id) DO NOTHING;

  PERFORM private.log_audit_event('panel.imported','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id);
    PERFORM private.complete_idempotency(v_actor,'panel.import',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.importar_painel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_painel(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remover_painel_importado(
  p_panel_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_deleted int; v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.import.remove',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  WITH deleted AS (
    DELETE FROM public.workspace_members
     WHERE workspace_id = p_panel_id AND member_user_id = v_actor AND role = 'visitante'
     RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'NOT_A_VISITOR' USING ERRCODE='P0002';
  END IF;

  PERFORM private.log_audit_event('panel.import_removed','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id);
    PERFORM private.complete_idempotency(v_actor,'panel.import.remove',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.remover_painel_importado(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_painel_importado(uuid, uuid) TO authenticated;

-- ============================================================
-- 8) Gestão de colaboradores (só o gestor / admin técnico)
-- ============================================================
CREATE OR REPLACE FUNCTION public.definir_colaborador_painel(
  p_panel_id uuid,
  p_member_user_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record; v_public boolean; v_member_active boolean; v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.collaborator.set',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_panel_id);
  IF v_acc.access_mode NOT IN ('owner','technical_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT is_public INTO v_public FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL;
  IF v_public IS NULL THEN RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT v_public THEN RAISE EXCEPTION 'PANEL_IS_PRIVATE' USING ERRCODE='42501'; END IF;
  IF p_member_user_id = v_acc.defensor_user_id THEN
    RAISE EXCEPTION 'CANNOT_MODIFY_OWNER' USING ERRCODE='22023';
  END IF;

  SELECT (status = 'ativo'::public.profile_status AND ativo = true) INTO v_member_active
    FROM public.profiles WHERE user_id = p_member_user_id;
  IF NOT COALESCE(v_member_active, false) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, member_user_id, role, added_by)
  VALUES (p_panel_id, p_member_user_id, 'colaborador', v_actor)
  ON CONFLICT (workspace_id, member_user_id) DO UPDATE SET role = 'colaborador';

  PERFORM private.log_audit_event('panel.collaborator_set','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('member_user_id', p_member_user_id), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id, 'memberUserId', p_member_user_id);
    PERFORM private.complete_idempotency(v_actor,'panel.collaborator.set',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.definir_colaborador_painel(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_colaborador_painel(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remover_colaborador_painel(
  p_panel_id uuid,
  p_member_user_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record; v_deleted int; v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.collaborator.remove',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_panel_id);
  IF v_acc.access_mode NOT IN ('owner','technical_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.workspace_members
     WHERE workspace_id = p_panel_id AND member_user_id = p_member_user_id AND role = 'colaborador'
     RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'NOT_A_COLLABORATOR' USING ERRCODE='P0002';
  END IF;

  PERFORM private.log_audit_event('panel.collaborator_removed','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL,
    jsonb_build_object('member_user_id', p_member_user_id), NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id, 'memberUserId', p_member_user_id);
    PERFORM private.complete_idempotency(v_actor,'panel.collaborator.remove',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.remover_colaborador_painel(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_colaborador_painel(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sair_de_colaborador_painel(
  p_panel_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_deleted int; v_replay jsonb;
BEGIN
  PERFORM private.assert_authenticated_defensor(v_actor);

  v_replay := private.claim_idempotency(v_actor,'panel.collaborator.leave',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  WITH deleted AS (
    DELETE FROM public.workspace_members
     WHERE workspace_id = p_panel_id AND member_user_id = v_actor AND role = 'colaborador'
     RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'NOT_A_COLLABORATOR' USING ERRCODE='P0002';
  END IF;

  PERFORM private.log_audit_event('panel.collaborator_left','defensor_workspace',
    p_panel_id::text,'sucesso'::public.audit_result, NULL, NULL, NULL, NULL, NULL);

  DECLARE v_result jsonb;
  BEGIN
    v_result := jsonb_build_object('panelId', p_panel_id);
    PERFORM private.complete_idempotency(v_actor,'panel.collaborator.leave',p_idempotency_key, v_result);
    RETURN v_result;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.sair_de_colaborador_painel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sair_de_colaborador_painel(uuid, uuid) TO authenticated;

-- ============================================================
-- 9) Panorama do painel (descrição + gestor + colaboradores + visitantes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.obter_panorama_painel(p_panel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record;
  v_ws record;
  v_gestor jsonb;
  v_colaboradores jsonb;
  v_visitantes jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_ws FROM public.defensor_workspaces
   WHERE id = p_panel_id AND archived_at IS NULL;
  IF v_ws.id IS NULL THEN RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_panel_id);
  IF NOT v_acc.can_view THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object('userId', p.user_id, 'nome', p.nome_completo)
    INTO v_gestor
    FROM public.profiles p WHERE p.user_id = v_ws.defensor_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'userId', p.user_id, 'nome', p.nome_completo, 'since', m.created_at
    ) ORDER BY p.nome_completo), '[]'::jsonb)
    INTO v_colaboradores
    FROM public.workspace_members m
    JOIN public.profiles p ON p.user_id = m.member_user_id
   WHERE m.workspace_id = p_panel_id AND m.role = 'colaborador';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'userId', p.user_id, 'nome', p.nome_completo, 'since', m.created_at
    ) ORDER BY p.nome_completo), '[]'::jsonb)
    INTO v_visitantes
    FROM public.workspace_members m
    JOIN public.profiles p ON p.user_id = m.member_user_id
   WHERE m.workspace_id = p_panel_id AND m.role = 'visitante';

  RETURN jsonb_build_object(
    'panelId', v_ws.id,
    'nome', v_ws.nome,
    'descricao', v_ws.descricao,
    'isPublic', v_ws.is_public,
    'gestor', v_gestor,
    'colaboradores', v_colaboradores,
    'visitantes', v_visitantes,
    'callerAccessMode', v_acc.access_mode,
    'canManageCollaborators', (v_acc.access_mode IN ('owner','technical_admin'))
  );
END $function$;

REVOKE ALL ON FUNCTION public.obter_panorama_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_panorama_painel(uuid) TO authenticated;

-- ============================================================
-- 10) listar_area_trabalho_defensor — inclui painéis importados/colaborados
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_area_trabalho_defensor(p_defensor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_active boolean;
  v_defensor_exists boolean;
  v_access_mode text := NULL;
  v_is_owner boolean := false;
  v_is_admin_tecnico boolean := false;
  v_is_member_bound boolean := false;
  v_can_edit boolean := false;
  v_panels jsonb;
  v_panel_count int;
  v_active_panel_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF p_defensor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT (status = 'ativo'::public.profile_status AND ativo = true)
    INTO v_caller_active
  FROM public.profiles
  WHERE user_id = v_caller;

  IF NOT COALESCE(v_caller_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  v_defensor_exists := private.user_is_active_defensor(p_defensor_user_id);

  IF NOT v_defensor_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  v_is_owner := (v_caller = p_defensor_user_id);

  IF NOT v_is_owner THEN
    v_is_admin_tecnico := private.tem_papel(v_caller, 'admin_tecnico'::public.app_role);
  END IF;

  IF NOT v_is_owner AND NOT v_is_admin_tecnico THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.member_defensor_bonds b
      JOIN public.defensor_context dc ON dc.user_id = v_caller
      WHERE b.member_user_id = v_caller
        AND b.defensor_user_id = p_defensor_user_id
        AND b.status = 'ativo'::public.member_defensor_bond_status
        AND b.ended_at IS NULL
        AND dc.defensor_user_id = p_defensor_user_id
    ) INTO v_is_member_bound;
  END IF;

  IF v_is_owner THEN
    v_access_mode := 'owner';
    v_can_edit := true;
  ELSIF v_is_admin_tecnico THEN
    v_access_mode := 'technical_admin';
    v_can_edit := true;
  ELSIF v_is_member_bound THEN
    v_access_mode := 'team_readonly';
    v_can_edit := false;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Painéis próprios do Defensor Público desta Área de Trabalho, mais os
  -- painéis públicos que ele importou (visitante) ou nos quais colabora.
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_group, t.order_position, t.sort_time), '[]'::jsonb),
         COUNT(*)::int
    INTO v_panels, v_panel_count
  FROM (
    SELECT w.id, w.defensor_user_id, w.nome, w.icone, w.order_position,
           w.optimistic_version, w.archived_at, w.created_at,
           w.is_public, w.descricao,
           'owner'::text AS panel_role, 0 AS sort_group, w.created_at AS sort_time
      FROM public.defensor_workspaces w
     WHERE w.defensor_user_id = p_defensor_user_id
       AND w.archived_at IS NULL
    UNION ALL
    SELECT w.id, w.defensor_user_id, w.nome, w.icone, w.order_position,
           w.optimistic_version, w.archived_at, w.created_at,
           w.is_public, w.descricao,
           m.role AS panel_role, 1 AS sort_group, m.created_at AS sort_time
      FROM public.workspace_members m
      JOIN public.defensor_workspaces w ON w.id = m.workspace_id AND w.archived_at IS NULL
     WHERE m.member_user_id = p_defensor_user_id
  ) t;

  IF v_panel_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'WORK_AREA_NOT_INITIALIZED',
      'access', jsonb_build_object(
        'accessMode', v_access_mode,
        'canView', true,
        'canEditWorkspace', v_can_edit,
        'canManagePanels', v_can_edit,
        'canManageColumns', v_can_edit,
        'canMoveCards', v_can_edit,
        'canAddItems', v_can_edit
      )
    );
  END IF;

  SELECT (v_panels->0->>'id')::uuid INTO v_active_panel_id;

  RETURN jsonb_build_object(
    'ok', true,
    'defenderUserId', p_defensor_user_id,
    'panelCount', v_panel_count,
    'activePanelId', v_active_panel_id,
    'panels', v_panels,
    'access', jsonb_build_object(
      'accessMode', v_access_mode,
      'canView', true,
      'canEditWorkspace', v_can_edit,
      'canManagePanels', v_can_edit,
      'canManageColumns', v_can_edit,
      'canMoveCards', v_can_edit,
      'canAddItems', v_can_edit
    )
  );
END;
$function$;

-- ============================================================
-- 11) listar_workspace_completo — expõe visibilidade/descrição/permissões
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_workspace_completo(p_panel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_ws record;
  v_acc record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_panel_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_ws
    FROM public.defensor_workspaces
   WHERE id = p_panel_id
     AND archived_at IS NULL;

  IF v_ws.id IS NULL THEN
    RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws.id);
  IF NOT v_acc.can_view THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'descricao', c.descricao,
      'corToken', c.cor_token,
      'corCustom', c.cor,
      'orderPosition', c.order_position,
      'icone', c.icone
    ) ORDER BY c.order_position), '[]'::jsonb)
    INTO v_columns
    FROM public.defensor_workspace_columns c
   WHERE c.workspace_id = v_ws.id;

  WITH raw AS (
    SELECT k.id, k.column_id, k.item_id, k.order_position, k.updated_at,
           i.kind, i.owner_user_id, i.status,
           v.title, v.version_number, v.body_text, v.body_json,
           pv.title AS pub_title, pv.version_number AS pub_version,
           pr.nome_completo AS owner_name,
           COALESCE((
             SELECT jsonb_agg(cc.nome ORDER BY cc.order_position)
               FROM public.content_item_categories cic
               JOIN public.content_categories cc ON cc.id = cic.category_id
              WHERE cic.item_id = i.id
           ), '[]'::jsonb) AS categorias
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id AND i.deleted_at IS NULL
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_versions pv ON pv.id = i.current_published_version_id
      LEFT JOIN public.profiles pr ON pr.user_id = i.owner_user_id
     WHERE k.workspace_id = v_ws.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cardId',       r.id,
    'workspaceId',  v_ws.id,
    'columnId',     r.column_id,
    'itemId',       r.item_id,
    'kind',         r.kind,
    'placement',    CASE WHEN r.owner_user_id = v_acc.defensor_user_id THEN 'owned' ELSE 'imported' END,
    'title',        COALESCE(r.pub_title, r.title, '(sem título)'),
    'description',  NULL,
    'categoryNames', r.categorias,
    'ownerDisplayName', COALESCE(r.owner_name, ''),
    'status',       r.status,
    'publishedVersionNumber', r.pub_version,
    'updatedAt',    r.updated_at,
    'archivedByAuthor', (r.status = 'arquivado'),
    'orderPosition', r.order_position,
    'bodyText', CASE WHEN r.kind = 'cota' THEN r.body_text ELSE NULL END,
    'bodyHtml', CASE WHEN r.kind = 'cota' THEN (r.body_json->>'html') ELSE NULL END,
    'canOpen', (
      (v_acc.access_mode = 'owner')
      OR (r.status = 'publicado')
      OR (r.status = 'arquivado' AND r.pub_version IS NOT NULL)
    ),
    'canEdit', (r.owner_user_id = v_actor),
    'canUse',  (
      (r.status = 'publicado')
      OR (v_acc.access_mode = 'owner' AND r.status <> 'arquivado')
    )
  ) ORDER BY r.order_position), '[]'::jsonb)
    INTO v_cards
    FROM raw r;

  RETURN jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id,
      'defensorUserId', v_ws.defensor_user_id,
      'nome', v_ws.nome,
      'icone', v_ws.icone,
      'descricao', v_ws.descricao,
      'isPublic', v_ws.is_public,
      'optimisticVersion', v_ws.optimistic_version,
      'updatedAt', v_ws.updated_at
    ),
    'access', jsonb_build_object(
      'accessMode', v_acc.access_mode,
      'canEditWorkspace', v_acc.can_edit_workspace,
      'canManageColumns', v_acc.can_manage_columns,
      'canMoveCards', v_acc.can_move_cards,
      'canAddItems', v_acc.can_add_items,
      'canDeleteWorkspace', v_acc.can_delete_workspace
    ),
    'columns', v_columns,
    'cards', v_cards
  );
END;
$function$;

-- ============================================================
-- 12) buscar_paineis_publicos — motor de busca da Biblioteca (aba Painéis)
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_paineis_publicos(
  p_query text DEFAULT NULL::text,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_active boolean;
  v_q text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT (status = 'ativo'::public.profile_status AND ativo = true) INTO v_active
    FROM public.profiles WHERE user_id = v_actor;
  IF NOT COALESCE(v_active, false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_q := nullif(btrim(coalesce(p_query,'')), '');

  WITH filtered AS (
    SELECT w.id, w.nome, w.icone, w.descricao, w.defensor_user_id, w.created_at,
           pr.nome_completo AS owner_name,
           COALESCE(mc.total, 0) AS member_count,
           row_number() OVER (ORDER BY w.nome) AS rn
      FROM public.defensor_workspaces w
      LEFT JOIN public.profiles pr ON pr.user_id = w.defensor_user_id
      LEFT JOIN (
        SELECT workspace_id, count(*) AS total FROM public.workspace_members GROUP BY workspace_id
      ) mc ON mc.workspace_id = w.id
     WHERE w.archived_at IS NULL
       AND w.is_public = true
       AND (v_q IS NULL OR w.nome ILIKE '%'||v_q||'%' OR w.descricao ILIKE '%'||v_q||'%')
     ORDER BY w.nome
     LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'panelId', f.id,
      'nome', f.nome,
      'icone', f.icone,
      'descricao', f.descricao,
      'ownerUserId', f.defensor_user_id,
      'ownerDisplayName', COALESCE(f.owner_name, ''),
      'createdAt', f.created_at,
      'memberCount', f.member_count,
      'isOwn', (f.defensor_user_id = v_actor),
      'alreadyImported', EXISTS (
        SELECT 1 FROM public.workspace_members m
         WHERE m.workspace_id = f.id AND m.member_user_id = v_actor
      )
    ) ORDER BY f.rn), '[]'::jsonb)
    INTO v_result
    FROM filtered f;

  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.buscar_paineis_publicos(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_paineis_publicos(text, int, int) TO authenticated;

-- ============================================================
-- 13) buscar_usuarios_para_colaborador — busca de usuários para o gestor
--     definir como colaborador (qualquer usuário ativo, não só Defensores).
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_usuarios_para_colaborador(
  p_panel_id uuid,
  p_termo text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_acc record;
  v_termo text;
  v_pattern text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_panel_id);
  IF v_acc.access_mode NOT IN ('owner','technical_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_termo := btrim(coalesce(p_termo, ''));
  IF char_length(v_termo) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'items', '[]'::jsonb);
  END IF;

  v_pattern := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."displayName"), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        u.id AS "userId",
        COALESCE(NULLIF(btrim(pr.nome_completo), ''), 'Usuário') AS "displayName",
        lower(u.email::text) AS "email",
        m.role AS "currentRole"
      FROM auth.users u
      JOIN public.profiles pr ON pr.user_id = u.id
      LEFT JOIN public.workspace_members m
        ON m.workspace_id = p_panel_id AND m.member_user_id = u.id
      WHERE pr.status = 'ativo'::public.profile_status
        AND pr.ativo = true
        AND u.id <> v_acc.defensor_user_id
        AND (
          lower(coalesce(pr.nome_completo, '')) LIKE lower(v_pattern) ESCAPE '\'
          OR lower(u.email::text) LIKE lower(v_pattern) ESCAPE '\'
        )
      ORDER BY pr.nome_completo NULLS LAST
      LIMIT 20
    ) t;

  RETURN jsonb_build_object('ok', true, 'items', v_result);
END $function$;

REVOKE ALL ON FUNCTION public.buscar_usuarios_para_colaborador(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_usuarios_para_colaborador(uuid, text) TO authenticated;

-- ============================================================
-- 14) Realtime — necessário para que visitantes/colaboradores vejam as
--     alterações do gestor "em tempo real", conforme a especificação.
-- ============================================================
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'defensor_workspace_columns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.defensor_workspace_columns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'defensor_workspace_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.defensor_workspace_cards;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'defensor_workspaces'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.defensor_workspaces;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Ambiente sem a publicação padrão do Supabase Realtime (ex.: validação
  -- local via embedded-postgres) — não bloqueia a aplicação da migração.
  NULL;
END $do$;
