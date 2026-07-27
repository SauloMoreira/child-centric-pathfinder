-- Harden the internal role helper so clients cannot enumerate roles.
-- The SECURITY DEFINER RPC listar_area_trabalho_defensor runs as owner (postgres)
-- and continues to invoke it via qualified name.

REVOKE ALL ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) FROM authenticated;

-- service_role and postgres retain access for server-side operations.
GRANT EXECUTE ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) TO service_role;

COMMENT ON FUNCTION public.tem_papel_usuario(uuid, public.app_role) IS
  'Internal role helper. NOT executable by anon/authenticated. Invoked only by SECURITY DEFINER RPCs (e.g. public.listar_area_trabalho_defensor) that run as owner.';
