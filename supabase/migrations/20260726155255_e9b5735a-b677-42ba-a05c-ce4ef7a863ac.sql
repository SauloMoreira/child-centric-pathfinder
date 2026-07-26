-- =========================================================
-- 0004_access_requests.sql
-- Solicitações de acesso institucional (schema private)
-- =========================================================

CREATE TABLE private.access_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL
                           REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,

  -- Dados funcionais snapshot no momento do envio
  nome_completo            text NOT NULL,
  matricula                text NOT NULL,
  cargo                    text NOT NULL,
  telefone                 text,

  -- Órgão escolhido OU proposta de novo órgão
  orgao_id                 uuid REFERENCES public.orgaos_execucao(id)
                             ON DELETE RESTRICT ON UPDATE NO ACTION,
  proposta_novo_orgao_nome    text,
  proposta_novo_orgao_sigla   text,
  proposta_novo_orgao_comarca text,
  proposta_novo_orgao_cidade  text,

  aceite_termos_at         timestamptz NOT NULL,

  -- Ciclo da solicitação
  status                   public.access_request_status NOT NULL DEFAULT 'pendente',
  version                  integer NOT NULL DEFAULT 1,

  decidido_por             uuid REFERENCES auth.users(id)
                             ON DELETE NO ACTION ON UPDATE NO ACTION,
  decidido_em              timestamptz,
  motivo_rejeicao          text,
  orgao_final_id           uuid REFERENCES public.orgaos_execucao(id)
                             ON DELETE RESTRICT ON UPDATE NO ACTION,

  correlation_id           uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Precisa fornecer órgão existente OU proposta completa, nunca ambos
  CONSTRAINT access_requests_orgao_xor_proposta CHECK (
    (orgao_id IS NOT NULL AND proposta_novo_orgao_nome IS NULL)
    OR
    (orgao_id IS NULL
     AND proposta_novo_orgao_nome IS NOT NULL
     AND proposta_novo_orgao_sigla IS NOT NULL)
  ),

  -- Coerência da decisão
  CONSTRAINT access_requests_decisao_coherence CHECK (
    (status IN ('pendente','em_analise','cancelada')
       AND decidido_por IS NULL AND decidido_em IS NULL)
    OR
    (status IN ('aprovada','rejeitada')
       AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
  )
);

GRANT ALL ON private.access_requests TO service_role;

ALTER TABLE private.access_requests ENABLE ROW LEVEL SECURITY;

-- Ao usuário só é permitido ter uma solicitação NÃO finalizada por vez
CREATE UNIQUE INDEX access_requests_one_open_per_user
  ON private.access_requests (user_id)
  WHERE status IN ('pendente','em_analise');

CREATE TRIGGER trg_access_requests_updated_at
BEFORE UPDATE ON private.access_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE private.access_requests IS
  'Solicitações de acesso institucional. Criadas via RPC após o usuário '
  'preencher o formulário de dados funcionais. NÃO expostas pelo PostgREST.';