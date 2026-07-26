CREATE TABLE private.idempotency_operations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL,
  operation_name  text NOT NULL,
  actor_user_id   uuid NOT NULL,
  request_hash    text NULL,
  status          text NOT NULL CHECK (status IN ('pending','completed','failed')),
  result          jsonb NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz NULL,
  expires_at      timestamptz NULL,
  CONSTRAINT idempotency_actor_op_key_unique UNIQUE (actor_user_id, operation_name, idempotency_key)
);
REVOKE ALL ON private.idempotency_operations FROM PUBLIC, anon, authenticated;

CREATE TABLE private.orgao_workspaces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  nome              text NOT NULL DEFAULT 'Área de trabalho',
  is_default        boolean NOT NULL DEFAULT true,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX orgao_workspaces_one_default_per_org
  ON private.orgao_workspaces (orgao_execucao_id) WHERE is_default = true;
CREATE INDEX orgao_workspaces_by_org ON private.orgao_workspaces (orgao_execucao_id);
CREATE TRIGGER trg_orgao_workspaces_set_updated_at
  BEFORE UPDATE ON private.orgao_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
REVOKE ALL ON private.orgao_workspaces FROM PUBLIC, anon, authenticated;

CREATE TABLE private.orgao_workspace_columns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES private.orgao_workspaces(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (length(btrim(title)) > 0),
  description       text NULL,
  color_token       public.workspace_color_enum NOT NULL DEFAULT 'neutral',
  custom_color      text NULL,
  filter_definition jsonb NOT NULL DEFAULT '{}',
  position          integer NOT NULL,
  is_base_column    boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           bigint NOT NULL DEFAULT 1,
  CONSTRAINT orgao_wsc_position_unique UNIQUE (workspace_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX orgao_wsc_one_base_per_ws
  ON private.orgao_workspace_columns (workspace_id) WHERE is_base_column = true;
CREATE INDEX orgao_wsc_by_workspace ON private.orgao_workspace_columns (workspace_id, position);
CREATE TRIGGER trg_orgao_wsc_set_updated_at
  BEFORE UPDATE ON private.orgao_workspace_columns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
REVOKE ALL ON private.orgao_workspace_columns FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.user_can_read_org_workspace(p_orgao_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_orgao_id IS NULL THEN RETURN false; END IF;
  IF private.is_admin_tecnico() THEN RETURN true; END IF;
  IF private.current_user_is_admin() THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM private.user_org_memberships
                  WHERE user_id = v_uid AND orgao_id = p_orgao_id AND ativo = true);
END $$;
REVOKE ALL ON FUNCTION private.user_can_read_org_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_read_org_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.user_can_edit_org_workspace(p_orgao_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_orgao_id IS NULL THEN RETURN false; END IF;
  IF private.is_admin_tecnico() THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM private.user_org_memberships m
                  WHERE m.user_id = v_uid AND m.orgao_id = p_orgao_id AND m.ativo = true
                    AND public.tem_papel('defensor_publico'::public.app_role));
END $$;
REVOKE ALL ON FUNCTION private.user_can_edit_org_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_edit_org_workspace(uuid) TO authenticated;

CREATE TABLE private.legacy_user_workspace_backup (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_workspace_id    uuid NOT NULL,
  user_id                uuid NOT NULL,
  orgao_execucao_id      uuid NULL,
  snapshot               jsonb NOT NULL,
  migrated_workspace_id  uuid NULL,
  migration_status       text NOT NULL CHECK (migration_status IN ('pending','migrated','conflict','skipped')),
  created_at             timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.legacy_user_workspace_backup FROM PUBLIC, anon, authenticated;

DO $migrate$
DECLARE
  ws RECORD;
  v_new_ws_id      uuid;
  v_existing_ws_id uuid;
  v_snapshot       jsonb;
  v_status         text;
  v_had_conflict   boolean;
  v_col_count      integer;
BEGIN
  FOR ws IN
    SELECT w.* FROM private.user_workspaces w
     WHERE w.orgao_execucao_id IS NOT NULL
     ORDER BY w.orgao_execucao_id, w.updated_at DESC
  LOOP
    SELECT jsonb_build_object(
      'workspace', to_jsonb(ws.*),
      'columns', coalesce(
        (SELECT jsonb_agg(to_jsonb(c.*) ORDER BY c.position)
           FROM private.user_workspace_columns c WHERE c.workspace_id = ws.id),
        '[]'::jsonb)
    ) INTO v_snapshot;

    SELECT id INTO v_existing_ws_id
      FROM private.orgao_workspaces
     WHERE orgao_execucao_id = ws.orgao_execucao_id AND is_default = true
     LIMIT 1;

    IF v_existing_ws_id IS NULL THEN
      INSERT INTO private.orgao_workspaces
        (orgao_execucao_id, nome, is_default, created_by, updated_by, created_at, updated_at)
      VALUES (ws.orgao_execucao_id,
              coalesce(nullif(btrim(ws.nome), ''), 'Área de trabalho'),
              true, ws.user_id, ws.user_id, ws.created_at, ws.updated_at)
      RETURNING id INTO v_new_ws_id;

      INSERT INTO private.orgao_workspace_columns
        (id, workspace_id, title, description, color_token, custom_color,
         filter_definition, position, is_base_column,
         created_by, created_at, updated_by, updated_at, version)
      SELECT gen_random_uuid(), v_new_ws_id, c.title, c.description, c.color_token, c.custom_color,
             c.filter_definition, c.position, c.is_base_column,
             ws.user_id, c.created_at, ws.user_id, c.updated_at, c.version
        FROM private.user_workspace_columns c
       WHERE c.workspace_id = ws.id;

      GET DIAGNOSTICS v_col_count = ROW_COUNT;
      v_status := 'migrated'; v_had_conflict := false;
    ELSE
      v_new_ws_id := v_existing_ws_id;
      v_status := 'conflict'; v_had_conflict := true; v_col_count := 0;
    END IF;

    INSERT INTO private.legacy_user_workspace_backup
      (source_workspace_id, user_id, orgao_execucao_id, snapshot, migrated_workspace_id, migration_status)
    VALUES (ws.id, ws.user_id, ws.orgao_execucao_id, v_snapshot, v_new_ws_id, v_status);

    INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, metadata, orgao_id)
    VALUES (ws.user_id,
            CASE WHEN v_had_conflict THEN 'workspace.migration_conflict_detected'
                                     ELSE 'workspace.migrated_from_user' END,
            'user_workspace', ws.id::text,
            'sucesso'::public.audit_result,
            jsonb_build_object('institucional_ws_id', v_new_ws_id, 'colunas_migradas', v_col_count),
            ws.orgao_execucao_id);
  END LOOP;
END
$migrate$;

DO $ensure_base$
DECLARE ws RECORD;
BEGIN
  FOR ws IN SELECT id, orgao_execucao_id, created_by FROM private.orgao_workspaces LOOP
    IF NOT EXISTS (SELECT 1 FROM private.orgao_workspace_columns
                    WHERE workspace_id = ws.id AND is_base_column = true) THEN
      INSERT INTO private.orgao_workspace_columns
        (workspace_id, title, description, color_token, filter_definition, position, is_base_column, created_by)
      VALUES (ws.id, 'Todas as crianças e adolescentes',
              'Todos os assistidos cadastrados neste órgão de execução.',
              'neutral', '{}'::jsonb,
              coalesce((SELECT max(position)+1 FROM private.orgao_workspace_columns WHERE workspace_id = ws.id), 0),
              true, ws.created_by);
    END IF;
  END LOOP;
END
$ensure_base$;