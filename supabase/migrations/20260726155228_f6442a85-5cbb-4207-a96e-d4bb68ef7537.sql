-- =========================================================
-- 0003_private_authorization.sql
-- Autorização institucional (schema private, não exposto)
-- =========================================================

-- ---------- private.user_roles ----------
-- Fonte da verdade para papéis institucionais.
CREATE TABLE private.user_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL
               REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  role         public.app_role NOT NULL,
  granted_by   uuid REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  correlation_id uuid,
  CONSTRAINT user_roles_unique_active
    UNIQUE (user_id, role)
);

-- Nenhum grant para anon/authenticated: acesso somente via SECURITY DEFINER.
GRANT ALL ON private.user_roles TO service_role;

ALTER TABLE private.user_roles ENABLE ROW LEVEL SECURITY;
-- Não criamos policies: sem grants, PostgREST nunca chega aqui.
-- RLS habilitada como defesa em profundidade.

COMMENT ON TABLE private.user_roles IS
  'Fonte da verdade para papéis institucionais. NÃO exposto pelo PostgREST. '
  'Manipulação exclusiva via RPCs administrativas.';

-- ---------- private.user_org_memberships ----------
-- Fonte da verdade para vínculo com órgão de execução.
CREATE TABLE private.user_org_memberships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL
                 REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  orgao_id       uuid NOT NULL
                 REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ativo          boolean NOT NULL DEFAULT true,
  since          timestamptz NOT NULL DEFAULT now(),
  until          timestamptz,
  granted_by     uuid REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ended_by       uuid REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  motivo_encerramento text,
  correlation_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_org_memberships_period_check
    CHECK (until IS NULL OR until >= since),
  CONSTRAINT user_org_memberships_ativo_coherence
    CHECK (
      (ativo = true  AND until IS NULL) OR
      (ativo = false AND until IS NOT NULL)
    )
);

GRANT ALL ON private.user_org_memberships TO service_role;

ALTER TABLE private.user_org_memberships ENABLE ROW LEVEL SECURITY;

-- Índice parcial: no máximo um vínculo ativo por usuário.
CREATE UNIQUE INDEX user_org_memberships_one_active_per_user
  ON private.user_org_memberships (user_id)
  WHERE ativo = true;

CREATE TRIGGER trg_user_org_memberships_updated_at
BEFORE UPDATE ON private.user_org_memberships
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE private.user_org_memberships IS
  'Vínculo do usuário com órgão de execução. Um único vínculo ativo por '
  'usuário. NÃO exposto pelo PostgREST.';