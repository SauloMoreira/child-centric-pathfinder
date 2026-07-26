-- =========================================================
-- 0001_extensions_and_enums.sql
-- Reintegra Infância — Fundação institucional
-- Cria schema privado (não exposto) e enums do domínio
-- =========================================================

-- Schema privado para autorização, auditoria e solicitações de acesso.
-- NÃO deve ser exposto pelo PostgREST — apenas funções SECURITY DEFINER
-- podem manipular tabelas aqui dentro.
CREATE SCHEMA IF NOT EXISTS private;

-- Bloqueia acesso direto a qualquer objeto do schema private para os papéis
-- do PostgREST. Concessões pontuais serão feitas em migrations posteriores.
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- =========================================================
-- Enums do domínio
-- =========================================================

-- Papéis institucionais. Fonte da verdade fica em private.user_roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin_institucional',
      'defensor_publico',
      'membro_equipe'
    );
  END IF;
END$$;

-- Situação do perfil ao longo do ciclo institucional.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
    CREATE TYPE public.profile_status AS ENUM (
      'aguardando_dados',        -- criou conta, ainda não preencheu dados funcionais
      'aguardando_aprovacao',    -- enviou solicitação, aguarda decisão administrativa
      'ativo',                   -- aprovado, com vínculo e papel operacional
      'suspenso',                -- temporariamente bloqueado
      'inativo'                  -- desligamento institucional
    );
  END IF;
END$$;

-- Situação da solicitação de acesso.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_request_status') THEN
    CREATE TYPE public.access_request_status AS ENUM (
      'pendente',
      'em_analise',
      'aprovada',
      'rejeitada',
      'cancelada'
    );
  END IF;
END$$;

-- Resultado de uma ação auditada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_result') THEN
    CREATE TYPE public.audit_result AS ENUM (
      'sucesso',
      'falha',
      'negado'
    );
  END IF;
END$$;

-- Comentários institucionais
COMMENT ON SCHEMA private IS
  'Schema privado do Reintegra Infância. Contém autorização, auditoria e '
  'solicitações de acesso. Não deve ser exposto pelo PostgREST.';

COMMENT ON TYPE public.app_role IS
  'Papéis institucionais. Fonte da verdade em private.user_roles.';
COMMENT ON TYPE public.profile_status IS
  'Ciclo institucional do usuário no Reintegra Infância.';
COMMENT ON TYPE public.access_request_status IS
  'Estado da solicitação de acesso institucional.';
COMMENT ON TYPE public.audit_result IS
  'Resultado registrado em private.audit_events.';