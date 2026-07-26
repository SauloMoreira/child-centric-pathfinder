-- =========================================================
-- 0006_rls_and_grants.sql
-- Políticas de acesso (RLS) para tabelas expostas em public.*
-- =========================================================

-- ---------- public.orgaos_execucao ----------
-- SELECT: qualquer usuário autenticado
CREATE POLICY orgaos_execucao_select_authenticated
  ON public.orgaos_execucao
  FOR SELECT
  TO authenticated
  USING (ativo = true OR public.tem_papel('admin_institucional'::public.app_role));

-- INSERT/UPDATE/DELETE diretos ficam bloqueados. A criação e edição
-- ocorrem apenas via RPC administrativa (SECURITY DEFINER), que roda
-- como service_role e bypassa RLS. Nenhuma policy criada para
-- INSERT/UPDATE/DELETE = negação implícita.

-- ---------- public.profiles ----------

-- SELECT: usuário lê o próprio perfil; admin lê todos
CREATE POLICY profiles_select_self
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.tem_papel('admin_institucional'::public.app_role));

-- UPDATE: usuário só pode atualizar o próprio perfil E apenas
-- se ainda está aguardando dados/aprovação (fase de cadastro).
-- Um trigger BEFORE UPDATE garante que campos sensíveis não sejam
-- modificados por essa via.
CREATE POLICY profiles_update_own_registration
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('aguardando_dados','aguardando_aprovacao')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('aguardando_dados','aguardando_aprovacao')
  );

-- Trigger de guarda: usuário jamais pode alterar campos institucionais
-- via UPDATE direto. Apenas RPCs (rodando como service_role) podem.
CREATE OR REPLACE FUNCTION public.tg_profiles_guard_institucional_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Se veio de uma RPC administrativa (service_role), não bloqueia.
  IF current_setting('request.jwt.claims', true) IS NULL
     OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ativo  IS DISTINCT FROM OLD.ativo
     OR NEW.suspenso_em    IS DISTINCT FROM OLD.suspenso_em
     OR NEW.inativado_em   IS DISTINCT FROM OLD.inativado_em
     OR NEW.motivo_bloqueio IS DISTINCT FROM OLD.motivo_bloqueio
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Campos institucionais do perfil só podem ser alterados por procedimento administrativo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_profiles_guard_institucional_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_profiles_guard_institucional_fields() FROM anon;
REVOKE ALL ON FUNCTION public.tg_profiles_guard_institucional_fields() FROM authenticated;

CREATE TRIGGER trg_profiles_guard_institucional_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_guard_institucional_fields();

-- INSERT direto em profiles é sempre negado (não há policy INSERT).
-- Inserção ocorre apenas via trigger handle_new_user (SECURITY DEFINER).

-- DELETE direto é sempre negado (não há policy DELETE).