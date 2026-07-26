-- ============================================================
-- PART 1/3: Structure — membership type, operational context,
--          security functions, backfill
-- ============================================================

-- ---------- 1. Enum membership_type_enum ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='private' AND t.typname='membership_type_enum') THEN
    CREATE TYPE private.membership_type_enum AS ENUM ('defensor','membro_equipe','administrativo');
  END IF;
END $$;

-- ---------- 2. Column tipo_vinculo ----------
ALTER TABLE private.user_org_memberships
  ADD COLUMN IF NOT EXISTS tipo_vinculo private.membership_type_enum;

-- Backfill
UPDATE private.user_org_memberships m
SET tipo_vinculo = CASE
  WHEN r.role = 'defensor_publico' THEN 'defensor'::private.membership_type_enum
  WHEN r.role = 'membro_equipe'    THEN 'membro_equipe'::private.membership_type_enum
  ELSE 'administrativo'::private.membership_type_enum
END
FROM private.user_roles r
WHERE r.user_id = m.user_id
  AND m.tipo_vinculo IS NULL;

-- Fallback para memberships sem role
UPDATE private.user_org_memberships
SET tipo_vinculo = 'administrativo'::private.membership_type_enum
WHERE tipo_vinculo IS NULL;

ALTER TABLE private.user_org_memberships
  ALTER COLUMN tipo_vinculo SET NOT NULL;

-- ---------- 3. Substitui índices de unicidade ----------
DROP INDEX IF EXISTS private.user_org_memberships_one_active_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_active_user_org_type
  ON private.user_org_memberships (user_id, orgao_id, tipo_vinculo)
  WHERE ativo IS TRUE AND until IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member_single_active_org
  ON private.user_org_memberships (user_id)
  WHERE ativo IS TRUE AND until IS NULL AND tipo_vinculo = 'membro_equipe';

-- ---------- 4. Tabela contexto operacional ----------
CREATE TABLE IF NOT EXISTS private.user_operational_context (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  orgao_id     uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  selected_at  timestamptz NOT NULL DEFAULT now(),
  selected_by  uuid NOT NULL REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      bigint NOT NULL DEFAULT 1
);

DROP TRIGGER IF EXISTS trg_user_operational_context_updated_at ON private.user_operational_context;
CREATE TRIGGER trg_user_operational_context_updated_at
  BEFORE UPDATE ON private.user_operational_context
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

REVOKE ALL ON private.user_operational_context FROM PUBLIC;
REVOKE ALL ON private.user_operational_context FROM anon, authenticated;

-- ---------- 5. Funções privadas de segurança ----------

-- Membership check (por tipo, opcional)
CREATE OR REPLACE FUNCTION private.user_has_active_org_membership(
  p_user_id uuid,
  p_orgao_id uuid,
  p_tipo private.membership_type_enum DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.user_org_memberships m
     WHERE m.user_id = p_user_id
       AND m.orgao_id = p_orgao_id
       AND m.ativo IS TRUE
       AND m.until IS NULL
       AND (p_tipo IS NULL OR m.tipo_vinculo = p_tipo)
  );
$$;

-- Pode selecionar como contexto?
CREATE OR REPLACE FUNCTION private.user_can_select_org(p_orgao_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_user IS NULL OR p_orgao_id IS NULL THEN RETURN FALSE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao o WHERE o.id = p_orgao_id) THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;

  IF v_role = 'admin_tecnico' THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'admin_institucional' THEN
    -- Admin institucional pode selecionar qualquer órgão do escopo atual.
    -- Conservador: permitir qualquer órgão existente (escopo é aplicado nas RPCs).
    RETURN TRUE;
  END IF;

  IF v_role = 'defensor_publico' THEN
    RETURN private.user_has_active_org_membership(v_user, p_orgao_id, 'defensor');
  END IF;

  IF v_role = 'membro_equipe' THEN
    RETURN private.user_has_active_org_membership(v_user, p_orgao_id, 'membro_equipe');
  END IF;

  RETURN FALSE;
END;
$$;

-- Pode acessar o órgão (para operações e RLS)
CREATE OR REPLACE FUNCTION private.user_can_access_org(p_orgao_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_user IS NULL OR p_orgao_id IS NULL THEN RETURN FALSE; END IF;
  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;

  IF v_role IN ('admin_tecnico','admin_institucional') THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM private.user_org_memberships m
     WHERE m.user_id = v_user
       AND m.orgao_id = p_orgao_id
       AND m.ativo IS TRUE
       AND m.until IS NULL
  );
END;
$$;

-- Contexto operacional atual (com revalidação)
CREATE OR REPLACE FUNCTION private.current_operational_org_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_orgao uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  SELECT orgao_id INTO v_orgao FROM private.user_operational_context WHERE user_id = v_user;
  IF v_orgao IS NULL THEN RETURN NULL; END IF;
  IF NOT private.user_can_access_org(v_orgao) THEN RETURN NULL; END IF;
  RETURN v_orgao;
END;
$$;

-- Compatibilidade: current_active_org_id passa a delegar ao contexto operacional
CREATE OR REPLACE FUNCTION private.current_active_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.current_operational_org_id();
$$;

-- ---------- 6. Backfill de contexto operacional ----------
DO $backfill$
DECLARE
  v_single_count int;
BEGIN
  -- Usuários com exatamente 1 vínculo ativo → contexto = esse vínculo
  WITH ativos AS (
    SELECT user_id, COUNT(*) AS n
      FROM private.user_org_memberships
     WHERE ativo IS TRUE AND until IS NULL
     GROUP BY user_id
  ), com_um AS (
    SELECT a.user_id, m.orgao_id
      FROM ativos a
      JOIN private.user_org_memberships m
        ON m.user_id = a.user_id
       AND m.ativo IS TRUE
       AND m.until IS NULL
     WHERE a.n = 1
  )
  INSERT INTO private.user_operational_context (user_id, orgao_id, selected_by)
  SELECT c.user_id, c.orgao_id, c.user_id
    FROM com_um c
   WHERE NOT EXISTS (
     SELECT 1 FROM private.user_operational_context ctx WHERE ctx.user_id = c.user_id
   );

  GET DIAGNOSTICS v_single_count = ROW_COUNT;
  RAISE NOTICE 'user_operational_context: % contexto(s) criado(s) por vínculo único.', v_single_count;

  -- Defensores com N vínculos: contexto = vínculo mais recente (fallback determinístico)
  WITH ativos AS (
    SELECT user_id, COUNT(*) AS n
      FROM private.user_org_memberships
     WHERE ativo IS TRUE AND until IS NULL
     GROUP BY user_id
  ), com_multiplos AS (
    SELECT user_id FROM ativos WHERE n > 1
  ), mais_recente AS (
    SELECT DISTINCT ON (m.user_id)
           m.user_id, m.orgao_id
      FROM private.user_org_memberships m
      JOIN com_multiplos cm ON cm.user_id = m.user_id
     WHERE m.ativo IS TRUE AND m.until IS NULL
     ORDER BY m.user_id, m.since DESC
  )
  INSERT INTO private.user_operational_context (user_id, orgao_id, selected_by)
  SELECT r.user_id, r.orgao_id, r.user_id
    FROM mais_recente r
   WHERE NOT EXISTS (
     SELECT 1 FROM private.user_operational_context ctx WHERE ctx.user_id = r.user_id
   );

  GET DIAGNOSTICS v_single_count = ROW_COUNT;
  RAISE NOTICE 'user_operational_context: % contexto(s) criado(s) para usuários com múltiplos vínculos (vínculo mais recente).', v_single_count;
END;
$backfill$;

-- Auditoria da migração
INSERT INTO private.audit_events (action, entity, entity_id, result, metadata)
VALUES (
  'system.migration_applied',
  'private.user_org_memberships',
  NULL,
  'sucesso',
  jsonb_build_object(
    'migration', 'multiple_defender_memberships_and_operational_context',
    'notes', 'tipo_vinculo backfilled; single-user unique index dropped; operational context table + functions created; backfill executed.'
  )
);
