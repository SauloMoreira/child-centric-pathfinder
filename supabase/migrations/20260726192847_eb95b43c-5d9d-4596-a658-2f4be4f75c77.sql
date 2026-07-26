
CREATE TABLE IF NOT EXISTS public.processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  numero_processo text NOT NULL,
  numero_processo_normalizado char(20) NOT NULL,
  data_inicio date NOT NULL,
  status public.situacao_processo_enum,
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT processos_numero_20d CHECK (numero_processo_normalizado ~ '^\d{20}$'),
  CONSTRAINT processos_data_inicio_nao_futura CHECK (data_inicio <= current_date + interval '1 day')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_processos_num_por_orgao
  ON public.processos (orgao_execucao_id, numero_processo_normalizado)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_processos_orgao ON public.processos (orgao_execucao_id) WHERE deleted_at IS NULL;

GRANT SELECT ON public.processos TO authenticated;
GRANT ALL ON public.processos TO service_role;
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY processos_select ON public.processos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      private.is_admin_tecnico()
      OR private.current_user_is_admin()
      OR orgao_execucao_id = private.current_active_org_id()
    )
  );

DROP TRIGGER IF EXISTS tg_processos_updated ON public.processos;
CREATE TRIGGER tg_processos_updated
  BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- N:N processo × assistidos
CREATE TABLE IF NOT EXISTS public.processo_assistidos (
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processo_id, assistido_id)
);

CREATE INDEX IF NOT EXISTS idx_procass_assistido ON public.processo_assistidos (assistido_id);

GRANT SELECT ON public.processo_assistidos TO authenticated;
GRANT ALL ON public.processo_assistidos TO service_role;
ALTER TABLE public.processo_assistidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY procass_select ON public.processo_assistidos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = processo_assistidos.processo_id
        AND p.deleted_at IS NULL
        AND (
          private.is_admin_tecnico()
          OR private.current_user_is_admin()
          OR p.orgao_execucao_id = private.current_active_org_id()
        )
    )
  );
