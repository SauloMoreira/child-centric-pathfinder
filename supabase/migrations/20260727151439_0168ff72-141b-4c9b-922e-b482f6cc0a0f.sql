-- Gate 2 · 0025 · Foundation: library core (categories + items + immutable versions)

-- =========================================================================
-- Enums
-- =========================================================================
CREATE TYPE public.content_kind AS ENUM ('atendimento', 'cota');
CREATE TYPE public.content_visibility AS ENUM ('privado', 'orgao', 'institucional');
CREATE TYPE public.content_status AS ENUM ('rascunho', 'publicado', 'arquivado');

-- =========================================================================
-- Categories
-- =========================================================================
CREATE TABLE public.content_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  kind public.content_kind NOT NULL,
  cor text,
  order_position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_categories_kind_nome_uk UNIQUE (kind, nome_normalizado)
);

GRANT SELECT ON public.content_categories TO authenticated;
GRANT ALL    ON public.content_categories TO service_role;

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_categories_select_all
  ON public.content_categories
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER content_categories_touch
  BEFORE UPDATE ON public.content_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Content items (mutable metadata master)
-- =========================================================================
CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.content_kind NOT NULL,
  category_id uuid REFERENCES public.content_categories(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  orgao_id uuid REFERENCES public.orgaos_execucao(id),
  visibility public.content_visibility NOT NULL DEFAULT 'privado',
  status public.content_status NOT NULL DEFAULT 'rascunho',
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.content_items TO authenticated;
GRANT ALL    ON public.content_items TO service_role;

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- Owner always sees their own items.
CREATE POLICY content_items_select_owner
  ON public.content_items
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- Others see published items scoped to institutional or their current org context.
CREATE POLICY content_items_select_shared
  ON public.content_items
  FOR SELECT TO authenticated
  USING (
    status = 'publicado'
    AND (
      visibility = 'institucional'
      OR (
        visibility = 'orgao'
        AND orgao_id IS NOT NULL
        AND orgao_id = private.current_operational_org_id()
      )
    )
  );

CREATE INDEX content_items_owner_idx        ON public.content_items(owner_user_id);
CREATE INDEX content_items_kind_status_idx  ON public.content_items(kind, status);
CREATE INDEX content_items_orgao_idx        ON public.content_items(orgao_id);
CREATE INDEX content_items_category_idx     ON public.content_items(category_id);

CREATE TRIGGER content_items_touch
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- Content versions (append-only, immutable)
-- =========================================================================
CREATE TABLE public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  body_json jsonb NOT NULL,
  body_text text NOT NULL DEFAULT '',
  form_schema jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_versions_item_version_uk UNIQUE (item_id, version_number),
  CONSTRAINT content_versions_version_positive CHECK (version_number > 0)
);

GRANT SELECT ON public.content_versions TO authenticated;
GRANT ALL    ON public.content_versions TO service_role;

ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;

-- A version is visible whenever the parent item is visible to the caller.
CREATE POLICY content_versions_select_via_item
  ON public.content_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.content_items i
       WHERE i.id = content_versions.item_id
    )
  );

CREATE INDEX content_versions_item_idx
  ON public.content_versions(item_id, version_number DESC);

-- Immutability guard.
CREATE OR REPLACE FUNCTION public.tg_content_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'CONTENT_VERSION_IMMUTABLE'
    USING HINT = 'Content versions are append-only. Create a new version instead.';
END;
$$;

REVOKE ALL ON FUNCTION public.tg_content_versions_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER content_versions_no_update
  BEFORE UPDATE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_versions_immutable();

CREATE TRIGGER content_versions_no_delete
  BEFORE DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_versions_immutable();

-- =========================================================================
-- Forward declaration: current_version_id references content_versions
-- =========================================================================
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.content_versions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- =========================================================================
-- Documentation
-- =========================================================================
COMMENT ON TABLE public.content_categories IS
  'Reintegra (Gate 2): taxonomia institucional de atendimentos e cotas.';
COMMENT ON TABLE public.content_items IS
  'Reintegra (Gate 2): itens da biblioteca. Metadados mutáveis; conteúdo em content_versions. NUNCA armazena dados pessoais preenchidos.';
COMMENT ON TABLE public.content_versions IS
  'Reintegra (Gate 2): versões imutáveis (append-only) de cada item. body_json/form_schema são templates, nunca respostas preenchidas.';