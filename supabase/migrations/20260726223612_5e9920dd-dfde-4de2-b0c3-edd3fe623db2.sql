REVOKE ALL ON FUNCTION public.defensor_alterar_orgao_ativo(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.defensor_alterar_orgao_ativo(uuid, uuid, uuid) FROM authenticated;
DROP FUNCTION IF EXISTS public.defensor_alterar_orgao_ativo(uuid, uuid, uuid);