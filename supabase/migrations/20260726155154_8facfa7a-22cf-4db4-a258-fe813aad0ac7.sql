-- =========================================================
-- 0002_profiles_and_organizations.sql
-- Perfis institucionais e órgãos de execução (dados cadastrais)
-- =========================================================

-- ---------- Função utilitária: updated_at ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC;

-- =========================================================
-- Órgãos de execução da DPE-RS
-- =========================================================
CREATE TABLE public.orgaos_execucao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  sigla         text NOT NULL,
  comarca       text,
  cidade        text,
  uf            char(2) NOT NULL DEFAULT 'RS',
  ativo         boolean NOT NULL DEFAULT true,
  criado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orgaos_execucao_sigla_key UNIQUE (sigla),
  CONSTRAINT orgaos_execucao_nome_key  UNIQUE (nome)
);

-- Grants: leitura permitida para autenticados; escrita será feita apenas
-- via RPC administrativa (SECURITY DEFINER). Sem grant para anon.
GRANT SELECT ON public.orgaos_execucao TO authenticated;
GRANT ALL    ON public.orgaos_execucao TO service_role;

ALTER TABLE public.orgaos_execucao ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_orgaos_execucao_updated_at
BEFORE UPDATE ON public.orgaos_execucao
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.orgaos_execucao IS
  'Órgãos de execução institucionais (unidades da DPE-RS). '
  'Escrita apenas via RPC administrativa validada.';

-- =========================================================
-- Perfis institucionais
-- =========================================================
-- ATENÇÃO: ON DELETE NO ACTION garante que auth.users não possa ser
-- removido enquanto houver profile associado, preservando histórico.
CREATE TABLE public.profiles (
  user_id           uuid PRIMARY KEY
                    REFERENCES auth.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  nome_completo     text,
  matricula         text,
  cargo             text,
  telefone          text,
  status            public.profile_status NOT NULL DEFAULT 'aguardando_dados',
  ativo             boolean NOT NULL DEFAULT false,
  suspenso_em       timestamptz,
  inativado_em      timestamptz,
  motivo_bloqueio   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_matricula_key UNIQUE (matricula)
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL            ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.profiles IS
  'Perfil institucional do usuário. NÃO armazena papel de acesso. '
  'Papel é definido em private.user_roles.';

-- =========================================================
-- Gatilho de criação de perfil mínimo
-- =========================================================
-- Cria APENAS o profile mínimo na inserção em auth.users.
-- Não cria solicitação de acesso — isso só ocorre após o usuário
-- preencher e enviar o formulário via RPC dedicada.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome_completo, status, ativo)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'nome_completo', '')), ''),
    'aguardando_dados',
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria APENAS o profile mínimo do usuário. Solicitação de acesso deve '
  'ser criada posteriormente via RPC transacional dedicada.';