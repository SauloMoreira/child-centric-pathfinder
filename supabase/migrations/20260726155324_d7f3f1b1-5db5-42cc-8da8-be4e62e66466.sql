-- =========================================================
-- 0005_security_functions.sql
-- Funções de autorização (schema private) e helpers públicos
-- =========================================================

-- ---------- private.current_user_has_role ----------
CREATE OR REPLACE FUNCTION private.current_user_has_role(required_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role    = required_role
      AND ur.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.current_user_has_role(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_has_role(public.app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_user_has_role(public.app_role) TO authenticated;

COMMENT ON FUNCTION private.current_user_has_role(public.app_role) IS
  'Verifica se o usuário autenticado (auth.uid()) possui o papel indicado. '
  'Nunca aceita user_id do cliente.';

-- ---------- private.current_user_is_admin ----------
CREATE OR REPLACE FUNCTION private.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.current_user_has_role('admin_institucional'::public.app_role);
$$;

REVOKE ALL ON FUNCTION private.current_user_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_user_is_admin() TO authenticated;

-- ---------- private.current_user_has_aal2 ----------
-- Lê o AAL da sessão a partir do JWT (auth.jwt() -> 'aal').
CREATE OR REPLACE FUNCTION private.current_user_has_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

REVOKE ALL ON FUNCTION private.current_user_has_aal2() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_has_aal2() FROM anon;
GRANT  EXECUTE ON FUNCTION private.current_user_has_aal2() TO authenticated;

COMMENT ON FUNCTION private.current_user_has_aal2() IS
  'Retorna verdadeiro apenas se a sessão atual estiver em AAL2 (MFA). '
  'Obrigatório para ações administrativas sensíveis.';

-- ---------- public.tem_papel (fino, para UI e policies) ----------
-- Envoltório mínimo, sem parâmetros de usuário. Serve para:
--  - policies RLS em public.* (evita depender de private diretamente)
--  - leituras de UI (mostrar/ocultar botão administrativo)
CREATE OR REPLACE FUNCTION public.tem_papel(required_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.current_user_has_role(required_role);
$$;

REVOKE ALL ON FUNCTION public.tem_papel(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tem_papel(public.app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.tem_papel(public.app_role) TO authenticated;

COMMENT ON FUNCTION public.tem_papel(public.app_role) IS
  'Envoltório público de private.current_user_has_role. Nunca recebe user_id.';

-- =========================================================
-- Correção dos avisos anteriores: revogar exec de trigger helpers
-- =========================================================
REVOKE ALL ON FUNCTION public.tg_set_updated_at()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_set_updated_at()  FROM anon;
REVOKE ALL ON FUNCTION public.tg_set_updated_at()  FROM authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user()    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user()    FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user()    FROM authenticated;