CREATE OR REPLACE FUNCTION public.tem_papel_usuario(p_user_id uuid, p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = p_role
      AND ur.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) TO authenticated, service_role;