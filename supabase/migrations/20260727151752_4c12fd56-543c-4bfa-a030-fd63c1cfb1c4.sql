-- Gate 2 · 0026 · Defensor workspaces + member↔defensor bonds + defensor context

-- =========================================================================
-- Helper: is caller allowed to act for defensor D in org O?
--   Defensor D themselves: always.
--   Members: only if there is an active bond (member, D, O).
-- =========================================================================
CREATE TYPE public.member_defensor_bond_status AS ENUM ('ativo', 'encerrado');

CREATE TABLE public.member_defensor_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  defensor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orgao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE CASCADE,
  status public.member_defensor_bond_status NOT NULL DEFAULT 'ativo',
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX member_defensor_bonds_active_uk
  ON public.member_defensor_bonds (member_user_id, defensor_user_id, orgao_id)
  WHERE status = 'ativo';

CREATE INDEX member_defensor_bonds_member_idx
  ON public.member_defensor_bonds (member_user_id, status);
CREATE INDEX member_defensor_bonds_defensor_idx
  ON public.member_defensor_bonds (defensor_user_id, status);
CREATE INDEX member_defensor_bonds_orgao_idx
  ON public.member_defensor_bonds (orgao_id);

GRANT SELECT ON public.member_defensor_bonds TO authenticated;
GRANT ALL    ON public.member_defensor_bonds TO service_role;

ALTER TABLE public.member_defensor_bonds ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_defensor_bonds_select_self
  ON public.member_defensor_bonds
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid() OR defensor_user_id = auth.uid());

CREATE TRIGGER member_defensor_bonds_touch
  BEFORE UPDATE ON public.member_defensor_bonds
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Defensor context
-- =========================================================================
CREATE TABLE public.defensor_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  defensor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orgao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.defensor_context TO authenticated;
GRANT ALL    ON public.defensor_context TO service_role;

ALTER TABLE public.defensor_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY defensor_context_select_self
  ON public.defensor_context
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER defensor_context_touch
  BEFORE UPDATE ON public.defensor_context
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Helper functions (in private schema — user_roles lives in private)
-- =========================================================================
CREATE OR REPLACE FUNCTION private.user_is_defensor(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = _user
       AND ur.role = 'defensor_publico'::public.app_role
       AND ur.revoked_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION private.user_is_defensor(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.user_can_act_for_defensor(
  _caller uuid,
  _defensor uuid,
  _orgao uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _caller = _defensor
    OR EXISTS (
      SELECT 1 FROM public.member_defensor_bonds b
       WHERE b.member_user_id   = _caller
         AND b.defensor_user_id = _defensor
         AND b.orgao_id         = _orgao
         AND b.status           = 'ativo'
    );
$$;
REVOKE ALL ON FUNCTION private.user_can_act_for_defensor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- Defensor workspaces
-- =========================================================================
CREATE TABLE public.defensor_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defensor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orgao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE CASCADE,
  nome text NOT NULL,
  icone text,
  order_position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX defensor_workspaces_owner_idx
  ON public.defensor_workspaces (defensor_user_id, orgao_id, order_position);

GRANT SELECT ON public.defensor_workspaces TO authenticated;
GRANT ALL    ON public.defensor_workspaces TO service_role;

ALTER TABLE public.defensor_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY defensor_workspaces_select
  ON public.defensor_workspaces
  FOR SELECT TO authenticated
  USING (private.user_can_act_for_defensor(auth.uid(), defensor_user_id, orgao_id));

CREATE TRIGGER defensor_workspaces_touch
  BEFORE UPDATE ON public.defensor_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Defensor workspace columns
-- =========================================================================
CREATE TABLE public.defensor_workspace_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.defensor_workspaces(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text,
  order_position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX defensor_workspace_columns_ws_idx
  ON public.defensor_workspace_columns (workspace_id, order_position);

GRANT SELECT ON public.defensor_workspace_columns TO authenticated;
GRANT ALL    ON public.defensor_workspace_columns TO service_role;

ALTER TABLE public.defensor_workspace_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY defensor_workspace_columns_select
  ON public.defensor_workspace_columns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.defensor_workspaces w
       WHERE w.id = defensor_workspace_columns.workspace_id
    )
  );

CREATE TRIGGER defensor_workspace_columns_touch
  BEFORE UPDATE ON public.defensor_workspace_columns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Defensor workspace cards
-- =========================================================================
CREATE TABLE public.defensor_workspace_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.defensor_workspace_columns(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  order_position integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX defensor_workspace_cards_col_idx
  ON public.defensor_workspace_cards (column_id, order_position);
CREATE INDEX defensor_workspace_cards_item_idx
  ON public.defensor_workspace_cards (item_id);

GRANT SELECT ON public.defensor_workspace_cards TO authenticated;
GRANT ALL    ON public.defensor_workspace_cards TO service_role;

ALTER TABLE public.defensor_workspace_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY defensor_workspace_cards_select
  ON public.defensor_workspace_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.defensor_workspace_columns c
       WHERE c.id = defensor_workspace_cards.column_id
    )
  );

CREATE TRIGGER defensor_workspace_cards_touch
  BEFORE UPDATE ON public.defensor_workspace_cards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Documentation
-- =========================================================================
COMMENT ON TABLE public.member_defensor_bonds IS
  'Reintegra (Gate 2): vínculos Membro↔Defensor por órgão. Sem dados de assistido.';
COMMENT ON TABLE public.defensor_context IS
  'Reintegra (Gate 2): defensor atualmente representado pelo usuário logado.';
COMMENT ON TABLE public.defensor_workspaces IS
  'Reintegra (Gate 2): quadros pessoais do Defensor em cada órgão.';
COMMENT ON TABLE public.defensor_workspace_columns IS
  'Reintegra (Gate 2): colunas manuais do quadro (sem filtros automáticos).';
COMMENT ON TABLE public.defensor_workspace_cards IS
  'Reintegra (Gate 2): cartões que referenciam itens da biblioteca (nunca dados preenchidos).';