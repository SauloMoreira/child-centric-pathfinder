CREATE OR REPLACE FUNCTION private.tem_papel(p_user_id uuid, p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = p_role
      AND ur.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.tem_papel(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.tem_papel(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION private.tem_papel(uuid, public.app_role) FROM authenticated;