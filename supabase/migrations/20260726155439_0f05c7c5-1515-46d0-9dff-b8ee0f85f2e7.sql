-- =========================================================
-- 0008_indexes_and_constraints.sql
-- Índices para consultas administrativas frequentes
-- =========================================================

-- user_roles
CREATE INDEX ix_user_roles_user_id
  ON private.user_roles (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX ix_user_roles_role_active
  ON private.user_roles (role)
  WHERE revoked_at IS NULL;

-- user_org_memberships
CREATE INDEX ix_user_org_memberships_orgao_ativos
  ON private.user_org_memberships (orgao_id)
  WHERE ativo = true;

-- access_requests
CREATE INDEX ix_access_requests_status
  ON private.access_requests (status);

CREATE INDEX ix_access_requests_user_id
  ON private.access_requests (user_id);

CREATE INDEX ix_access_requests_created_at
  ON private.access_requests (created_at DESC);

-- audit_events
CREATE INDEX ix_audit_events_actor_at
  ON private.audit_events (actor_user_id, at DESC);

CREATE INDEX ix_audit_events_entity
  ON private.audit_events (entity, entity_id);

CREATE INDEX ix_audit_events_at
  ON private.audit_events (at DESC);

-- profiles
CREATE INDEX ix_profiles_status
  ON public.profiles (status);