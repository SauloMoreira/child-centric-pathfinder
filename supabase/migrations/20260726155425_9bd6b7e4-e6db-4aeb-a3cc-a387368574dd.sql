-- =========================================================
-- 0007_audit_events.sql
-- Auditoria institucional append-only
-- =========================================================

CREATE TABLE private.audit_events (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),

  actor_user_id   uuid,          -- Pode ser NULL para eventos do sistema
  actor_role      public.app_role,
  orgao_id        uuid REFERENCES public.orgaos_execucao(id)
                     ON DELETE NO ACTION ON UPDATE NO ACTION,

  action          text NOT NULL, -- ex: 'access_request.submit', 'access_request.approve'
  entity          text NOT NULL, -- ex: 'access_request', 'user_role', 'orgao_execucao'
  entity_id       text,          -- id do registro afetado, sempre como texto

  result          public.audit_result NOT NULL DEFAULT 'sucesso',
  changed_fields  jsonb,         -- { campo: { from: ..., to: ... } } — apenas o essencial
  metadata        jsonb,         -- metadados seguros (sem PII desnecessária)

  correlation_id  uuid,

  CONSTRAINT audit_events_no_secret_metadata CHECK (
    metadata IS NULL OR NOT (
      metadata ? 'password'      OR
      metadata ? 'senha'         OR
      metadata ? 'token'         OR
      metadata ? 'jwt'           OR
      metadata ? 'secret'        OR
      metadata ? 'access_token'  OR
      metadata ? 'refresh_token' OR
      metadata ? 'confirmation_link'
    )
  )
);

GRANT ALL ON private.audit_events TO service_role;
-- Nenhum grant para anon/authenticated. Inserção via função SECURITY DEFINER.

ALTER TABLE private.audit_events ENABLE ROW LEVEL SECURITY;

-- Append-only: bloqueia UPDATE/DELETE mesmo para service_role via trigger.
CREATE OR REPLACE FUNCTION private.tg_audit_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'private.audit_events é append-only. Operação % negada.', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_audit_events_no_update
BEFORE UPDATE ON private.audit_events
FOR EACH ROW EXECUTE FUNCTION private.tg_audit_events_append_only();

CREATE TRIGGER trg_audit_events_no_delete
BEFORE DELETE ON private.audit_events
FOR EACH ROW EXECUTE FUNCTION private.tg_audit_events_append_only();

-- ---------- Função de inserção segura de auditoria ----------
CREATE OR REPLACE FUNCTION private.log_audit_event(
  p_action         text,
  p_entity         text,
  p_entity_id      text,
  p_result         public.audit_result DEFAULT 'sucesso',
  p_changed_fields jsonb DEFAULT NULL,
  p_metadata       jsonb DEFAULT NULL,
  p_orgao_id       uuid  DEFAULT NULL,
  p_correlation_id uuid  DEFAULT NULL,
  p_actor_role     public.app_role DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO private.audit_events (
    actor_user_id, actor_role, orgao_id, action, entity, entity_id,
    result, changed_fields, metadata, correlation_id
  ) VALUES (
    auth.uid(), p_actor_role, p_orgao_id, p_action, p_entity, p_entity_id,
    p_result, p_changed_fields, p_metadata, p_correlation_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.log_audit_event(text,text,text,public.audit_result,jsonb,jsonb,uuid,uuid,public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.log_audit_event(text,text,text,public.audit_result,jsonb,jsonb,uuid,uuid,public.app_role) FROM anon;
REVOKE ALL ON FUNCTION private.log_audit_event(text,text,text,public.audit_result,jsonb,jsonb,uuid,uuid,public.app_role) FROM authenticated;

COMMENT ON TABLE private.audit_events IS
  'Auditoria institucional append-only. Nunca registrar senhas, tokens, JWTs, '
  'segredos, links de confirmação ou payloads completos de perfil.';