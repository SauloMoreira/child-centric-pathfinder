
CREATE OR REPLACE FUNCTION public.listar_orgaos_acessiveis(
  p_termo text DEFAULT NULL,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_ctx uuid;
  v_items jsonb;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_termo text := NULLIF(BTRIM(COALESCE(p_termo, '')), '');
  v_next uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'nextCursor', NULL);
  END IF;

  SELECT role INTO v_role FROM private.user_roles WHERE user_id = v_user LIMIT 1;
  v_ctx := private.current_operational_org_id();

  IF v_role IN ('admin_tecnico','admin_institucional') THEN
    WITH page AS (
      SELECT o.id, o.nome, o.comarca,
             row_number() OVER (ORDER BY o.nome, o.id) AS rn
        FROM public.orgaos_execucao o
       WHERE (v_termo IS NULL
              OR o.nome_normalizado ILIKE '%' || private.normalize_text(v_termo) || '%'
              OR o.comarca_normalizada ILIKE '%' || private.normalize_text(v_termo) || '%')
         AND (p_cursor IS NULL OR o.id > p_cursor)
       ORDER BY o.nome, o.id
       LIMIT v_limit + 1
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', p.id,
        'nome', p.nome,
        'comarcas', jsonb_build_array(jsonb_build_object('nome', p.comarca, 'principal', true)),
        'membershipId', NULL,
        'selecionado', (v_ctx = p.id)
      ) ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
      MAX(CASE WHEN p.rn = v_limit + 1 THEN p.id END)
    INTO v_items, v_next
    FROM page p;
  ELSE
    WITH page AS (
      SELECT o.id, o.nome, o.comarca, m.id AS membership_id, m.since,
             row_number() OVER (ORDER BY o.nome, o.id) AS rn
        FROM private.user_org_memberships m
        JOIN public.orgaos_execucao o ON o.id = m.orgao_id
       WHERE m.user_id = v_user
         AND m.ativo IS TRUE
         AND m.until IS NULL
         AND (v_termo IS NULL
              OR o.nome_normalizado ILIKE '%' || private.normalize_text(v_termo) || '%'
              OR o.comarca_normalizada ILIKE '%' || private.normalize_text(v_termo) || '%')
         AND (p_cursor IS NULL OR o.id > p_cursor)
       ORDER BY o.nome, o.id
       LIMIT v_limit + 1
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'orgaoId', p.id,
        'nome', p.nome,
        'comarcas', jsonb_build_array(jsonb_build_object('nome', p.comarca, 'principal', true)),
        'membershipId', p.membership_id,
        'dataInicio', p.since,
        'selecionado', (v_ctx = p.id)
      ) ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
      MAX(CASE WHEN p.rn = v_limit + 1 THEN p.id END)
    INTO v_items, v_next
    FROM page p;
  END IF;

  RETURN jsonb_build_object('items', v_items, 'nextCursor', v_next);
END;
$function$;
