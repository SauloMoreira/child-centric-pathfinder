
-- enum vinculo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vinculo_enum') THEN
    CREATE TYPE public.vinculo_enum AS ENUM ('pai','mae','familia_extensa','irmao');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.assistido_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  origem_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  destino_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  tipo public.vinculo_enum NOT NULL,
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT assistido_vinculos_no_self CHECK (origem_id <> destino_id)
);

-- unicidade
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistido_vinculos_active
  ON public.assistido_vinculos (origem_id, destino_id, tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vinculos_origem ON public.assistido_vinculos (origem_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculos_destino ON public.assistido_vinculos (destino_id) WHERE deleted_at IS NULL;

GRANT SELECT ON public.assistido_vinculos TO authenticated;
GRANT ALL ON public.assistido_vinculos TO service_role;

ALTER TABLE public.assistido_vinculos ENABLE ROW LEVEL SECURITY;

-- helper: acesso a um assistido (respeita a policy já em uso)
CREATE OR REPLACE FUNCTION private.user_can_access_assistido(p_assistido_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistidos a
     WHERE a.id = p_assistido_id
       AND a.deleted_at IS NULL
       AND (
         private.is_admin_tecnico()
         OR private.current_user_is_admin()
         OR a.orgao_execucao_id = private.current_active_org_id()
       )
  );
$$;
REVOKE ALL ON FUNCTION private.user_can_access_assistido(uuid) FROM PUBLIC;

CREATE POLICY vinculos_select ON public.assistido_vinculos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND private.user_can_access_assistido(origem_id)
    AND private.user_can_access_assistido(destino_id)
  );

-- Trigger de validação semântica
CREATE OR REPLACE FUNCTION public.tg_assistido_vinculos_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_o public.assistidos%ROWTYPE;
  v_d public.assistidos%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM public.assistidos WHERE id = NEW.origem_id;
  IF NOT FOUND OR v_o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ORIGIN_ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;
  SELECT * INTO v_d FROM public.assistidos WHERE id = NEW.destino_id;
  IF NOT FOUND OR v_d.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'DESTINATION_ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  IF v_o.orgao_execucao_id <> v_d.orgao_execucao_id THEN
    RAISE EXCEPTION 'ASSISTIDOS_FROM_DIFFERENT_ORGS' USING ERRCODE='42501';
  END IF;

  NEW.orgao_execucao_id := v_o.orgao_execucao_id;

  IF NEW.tipo IN ('pai','mae','familia_extensa') THEN
    -- origem = criança, destino = adulto
    IF v_o.categoria <> 'crianca_adolescente' THEN
      RAISE EXCEPTION 'ORIGIN_MUST_BE_MINOR' USING ERRCODE='22023';
    END IF;
    IF v_d.categoria <> 'adulto' THEN
      RAISE EXCEPTION 'DESTINATION_MUST_BE_ADULT' USING ERRCODE='22023';
    END IF;
  ELSIF NEW.tipo = 'irmao' THEN
    IF v_o.categoria <> 'crianca_adolescente' OR v_d.categoria <> 'crianca_adolescente' THEN
      RAISE EXCEPTION 'SIBLINGS_MUST_BE_MINORS' USING ERRCODE='22023';
    END IF;
    -- canonicalizar: menor uuid = origem
    IF NEW.origem_id > NEW.destino_id THEN
      DECLARE v_tmp uuid; BEGIN
        v_tmp := NEW.origem_id;
        NEW.origem_id := NEW.destino_id;
        NEW.destino_id := v_tmp;
      END;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_assistido_vinculos_validate ON public.assistido_vinculos;
CREATE TRIGGER tg_assistido_vinculos_validate
  BEFORE INSERT OR UPDATE ON public.assistido_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_assistido_vinculos_validate();
