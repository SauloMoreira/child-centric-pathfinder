
-- ============================================================
-- 0015 — Schema de assistidos (crianças e adolescentes)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enums -------------------------------------------------------
CREATE TYPE public.situacao_atual_enum AS ENUM (
  'familia_natural','familia_extensa','familia_substituta',
  'acolhimento_institucional','acolhimento_familiar',
  'guarda_provisoria','adocao_acompanhamento',
  'situacao_rua','nao_informado','outro'
);

CREATE TYPE public.tipo_acolhimento_enum AS ENUM ('institucional','familiar');

CREATE TYPE public.situacao_processo_enum AS ENUM (
  'ativo','suspenso','arquivado','concluido'
);

CREATE TYPE public.prioridade_enum AS ENUM ('baixa','media','alta','urgente');

CREATE TYPE public.parentesco_enum AS ENUM (
  'mae','pai','irmao','irma','avo','ava','tio','tia',
  'padrasto','madrasta','responsavel_legal','outro'
);

CREATE TYPE public.sexo_registral_enum AS ENUM ('feminino','masculino','nao_informado');

-- Tabela principal --------------------------------------------
CREATE TABLE public.assistidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  nome_social text,
  data_nascimento date NOT NULL,
  sexo_registral public.sexo_registral_enum NOT NULL DEFAULT 'nao_informado',
  genero text,
  foto_url text,
  situacao_atual public.situacao_atual_enum NOT NULL DEFAULT 'nao_informado',
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  responsavel_user_id uuid,
  observacoes text,
  search_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

GRANT SELECT ON public.assistidos TO authenticated;
GRANT ALL ON public.assistidos TO service_role;
ALTER TABLE public.assistidos ENABLE ROW LEVEL SECURITY;

-- Acolhimentos
CREATE TABLE public.assistido_acolhimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  tipo public.tipo_acolhimento_enum NOT NULL,
  entidade_nome text NOT NULL,
  data_ingresso date NOT NULL,
  data_saida date,
  data_reavaliacao date,
  motivo_encerramento text,
  ativo boolean GENERATED ALWAYS AS (data_saida IS NULL) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistido_acolhimentos TO authenticated;
GRANT ALL ON public.assistido_acolhimentos TO service_role;
ALTER TABLE public.assistido_acolhimentos ENABLE ROW LEVEL SECURITY;

-- Processos
CREATE TABLE public.assistido_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  numero_processo text,
  tipo text,
  situacao public.situacao_processo_enum NOT NULL DEFAULT 'ativo',
  prioridade public.prioridade_enum NOT NULL DEFAULT 'media',
  prazo_proximo date,
  extrajudicial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistido_processos TO authenticated;
GRANT ALL ON public.assistido_processos TO service_role;
ALTER TABLE public.assistido_processos ENABLE ROW LEVEL SECURITY;

-- Familiares
CREATE TABLE public.assistido_familiares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  parentesco public.parentesco_enum NOT NULL,
  responsavel boolean NOT NULL DEFAULT false,
  assistido_pela_dpe boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistido_familiares TO authenticated;
GRANT ALL ON public.assistido_familiares TO service_role;
ALTER TABLE public.assistido_familiares ENABLE ROW LEVEL SECURITY;

-- Providências
CREATE TABLE public.assistido_providencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  responsavel_user_id uuid,
  prazo date,
  prioridade public.prioridade_enum NOT NULL DEFAULT 'media',
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistido_providencias TO authenticated;
GRANT ALL ON public.assistido_providencias TO service_role;
ALTER TABLE public.assistido_providencias ENABLE ROW LEVEL SECURITY;

-- Trigger de search_text e updated_at -------------------------
CREATE OR REPLACE FUNCTION public.tg_assistidos_prepare()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  NEW.search_text := private.normalize_search_text(
    coalesce(NEW.nome_completo,'') || ' ' || coalesce(NEW.nome_social,'')
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_assistidos_prepare
BEFORE INSERT OR UPDATE ON public.assistidos
FOR EACH ROW EXECUTE FUNCTION public.tg_assistidos_prepare();

CREATE TRIGGER tg_assistido_acolh_updated
BEFORE UPDATE ON public.assistido_acolhimentos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER tg_assistido_proc_updated
BEFORE UPDATE ON public.assistido_processos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Índices -----------------------------------------------------
CREATE INDEX idx_assistidos_orgao ON public.assistidos(orgao_execucao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assistidos_situacao ON public.assistidos(situacao_atual) WHERE deleted_at IS NULL;
CREATE INDEX idx_assistidos_nascimento ON public.assistidos(data_nascimento);
CREATE INDEX idx_assistidos_search ON public.assistidos USING gin (search_text gin_trgm_ops);
CREATE INDEX idx_assistidos_updated ON public.assistidos(updated_at DESC);
CREATE INDEX idx_acolh_assistido_ativo ON public.assistido_acolhimentos(assistido_id) WHERE data_saida IS NULL;
CREATE INDEX idx_proc_assistido_ativo ON public.assistido_processos(assistido_id) WHERE situacao = 'ativo';
CREATE INDEX idx_proc_prazo ON public.assistido_processos(prazo_proximo) WHERE prazo_proximo IS NOT NULL;
CREATE INDEX idx_prov_pendente ON public.assistido_providencias(assistido_id) WHERE concluida_em IS NULL;
CREATE INDEX idx_fam_assistido ON public.assistido_familiares(assistido_id);

-- RLS ---------------------------------------------------------
CREATE POLICY assistidos_select ON public.assistidos FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    private.is_admin_tecnico()
    OR private.current_user_is_admin()
    OR orgao_execucao_id = private.current_active_org_id()
  )
);

CREATE POLICY assistido_acolh_select ON public.assistido_acolhimentos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.assistidos a WHERE a.id = assistido_id));

CREATE POLICY assistido_proc_select ON public.assistido_processos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.assistidos a WHERE a.id = assistido_id));

CREATE POLICY assistido_fam_select ON public.assistido_familiares FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.assistidos a WHERE a.id = assistido_id));

CREATE POLICY assistido_prov_select ON public.assistido_providencias FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.assistidos a WHERE a.id = assistido_id));

-- View de card ------------------------------------------------
CREATE OR REPLACE VIEW public.v_assistidos_card
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.nome_completo,
  a.nome_social,
  a.data_nascimento,
  date_part('year', age(a.data_nascimento))::int AS idade,
  CASE
    WHEN date_part('year', age(a.data_nascimento)) < 12 THEN 'crianca'
    ELSE 'adolescente'
  END AS faixa_etaria,
  a.sexo_registral,
  a.genero,
  a.foto_url,
  a.situacao_atual,
  a.orgao_execucao_id,
  a.responsavel_user_id,
  a.updated_at,
  (SELECT ac.id FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS acolhimento_ativo_id,
  (SELECT ac.entidade_nome FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS entidade_acolhimento,
  (SELECT ac.tipo FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tipo_acolhimento,
  (SELECT (CURRENT_DATE - ac.data_ingresso)::int
     FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tempo_acolhimento_dias,
  (SELECT ac.data_reavaliacao FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS proxima_reavaliacao,
  (SELECT COUNT(*)::int FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao = 'ativo') AS processos_ativos,
  (SELECT MIN(p.prazo_proximo) FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao='ativo' AND p.prazo_proximo IS NOT NULL) AS prazo_processo_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL) AS providencias_pendentes,
  (SELECT MIN(pr.prazo) FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL AND pr.prazo IS NOT NULL) AS prazo_providencia_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS total_familiares,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id
     AND f.parentesco IN ('irmao','irma')) AS total_irmaos,
  (SELECT BOOL_OR(f.assistido_pela_dpe) FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS familiar_dpe,
  a.search_text
FROM public.assistidos a
WHERE a.deleted_at IS NULL;

GRANT SELECT ON public.v_assistidos_card TO authenticated;

-- Seed --------------------------------------------------------
DO $$
DECLARE
  v_org1 uuid;
  v_org2 uuid;
  v_id uuid;
  v_nomes text[] := ARRAY[
    'Ana Beatriz Silva','João Pedro Costa','Maria Eduarda Santos','Lucas Oliveira',
    'Sofia Almeida','Miguel Ferreira','Isabela Ribeiro','Arthur Souza',
    'Helena Martins','Gabriel Nunes','Alice Barbosa','Enzo Cardoso',
    'Laura Machado','Bernardo Rocha','Valentina Dias','Heitor Lima',
    'Manuela Araújo','Théo Freitas','Cecília Mendes','Davi Correia',
    'Lívia Ramos','Pedro Henrique Gomes','Antonella Vieira','Rafael Cavalcanti',
    'Yasmin Peixoto','Gustavo Teixeira','Julia Moreira','Bruno Carvalho',
    'Larissa Farias','Matheus Duarte','Amanda Nogueira','Felipe Antunes',
    'Camila Rezende','Rodrigo Braga','Natália Prado','Vitor Fonseca',
    'Bianca Miranda','Leonardo Pires','Beatriz Cunha','Diego Salgado'
  ];
  v_situacoes public.situacao_atual_enum[] := ARRAY[
    'acolhimento_institucional','acolhimento_familiar','familia_extensa',
    'familia_substituta','guarda_provisoria','familia_natural','adocao_acompanhamento'
  ]::public.situacao_atual_enum[];
  v_entidades text[] := ARRAY[
    'Casa Lar São Vicente','Abrigo Esperança','Aldeia SOS Porto Alegre','Lar Amor Perfeito'
  ];
  i int;
  v_situ public.situacao_atual_enum;
  v_org uuid;
  v_nasc date;
BEGIN
  -- Pega até 2 órgãos existentes; se não houver, cria dois
  SELECT id INTO v_org1 FROM public.orgaos_execucao ORDER BY created_at LIMIT 1;
  IF v_org1 IS NULL THEN
    INSERT INTO public.orgaos_execucao (nome, comarca) VALUES
      ('1ª Defensoria da Infância', 'Porto Alegre') RETURNING id INTO v_org1;
  END IF;
  SELECT id INTO v_org2 FROM public.orgaos_execucao WHERE id <> v_org1 ORDER BY created_at LIMIT 1;
  IF v_org2 IS NULL THEN
    INSERT INTO public.orgaos_execucao (nome, comarca) VALUES
      ('2ª Defensoria da Infância', 'Canoas') RETURNING id INTO v_org2;
  END IF;

  FOR i IN 1..40 LOOP
    v_situ := v_situacoes[1 + (i % array_length(v_situacoes,1))];
    v_org := CASE WHEN i % 2 = 0 THEN v_org1 ELSE v_org2 END;
    v_nasc := CURRENT_DATE - ((365 * (1 + (i % 17))) + (i * 7))::int;

    INSERT INTO public.assistidos (nome_completo, data_nascimento, sexo_registral, situacao_atual, orgao_execucao_id)
    VALUES (v_nomes[i], v_nasc,
            CASE WHEN i % 2 = 0 THEN 'feminino'::public.sexo_registral_enum ELSE 'masculino'::public.sexo_registral_enum END,
            v_situ, v_org)
    RETURNING id INTO v_id;

    -- Acolhimento se situação for de acolhimento
    IF v_situ IN ('acolhimento_institucional','acolhimento_familiar') THEN
      INSERT INTO public.assistido_acolhimentos (assistido_id, tipo, entidade_nome, data_ingresso, data_reavaliacao)
      VALUES (v_id,
        CASE WHEN v_situ='acolhimento_institucional' THEN 'institucional'::public.tipo_acolhimento_enum
             ELSE 'familiar'::public.tipo_acolhimento_enum END,
        v_entidades[1 + (i % array_length(v_entidades,1))],
        CURRENT_DATE - ((i * 13) % 400),
        CURRENT_DATE + ((i * 5 % 90) - 30));
    END IF;

    -- Processo em ~70%
    IF i % 10 < 7 THEN
      INSERT INTO public.assistido_processos (assistido_id, numero_processo, tipo, situacao, prioridade, prazo_proximo, extrajudicial)
      VALUES (v_id,
        '5000' || lpad(i::text, 4, '0') || '-00.2025.8.21.0001',
        CASE i % 3 WHEN 0 THEN 'Destituição do poder familiar'
                   WHEN 1 THEN 'Guarda' ELSE 'Acolhimento' END,
        'ativo',
        (ARRAY['baixa','media','alta','urgente']::public.prioridade_enum[])[1 + (i % 4)],
        CURRENT_DATE + ((i * 3 % 60) - 15),
        i % 5 = 0);
    END IF;

    -- Familiares
    INSERT INTO public.assistido_familiares (assistido_id, nome, parentesco, responsavel, assistido_pela_dpe)
    VALUES (v_id, 'Genitora de ' || v_nomes[i], 'mae', true, i % 3 = 0);
    IF i % 4 = 0 THEN
      INSERT INTO public.assistido_familiares (assistido_id, nome, parentesco)
      VALUES (v_id, 'Irmão de ' || v_nomes[i], 'irmao');
    END IF;

    -- Providência pendente em ~50%
    IF i % 2 = 0 THEN
      INSERT INTO public.assistido_providencias (assistido_id, descricao, prazo, prioridade)
      VALUES (v_id, 'Elaborar relatório psicossocial',
        CURRENT_DATE + ((i * 4 % 45) - 10),
        (ARRAY['media','alta','urgente']::public.prioridade_enum[])[1 + (i % 3)]);
    END IF;
  END LOOP;
END $$;
