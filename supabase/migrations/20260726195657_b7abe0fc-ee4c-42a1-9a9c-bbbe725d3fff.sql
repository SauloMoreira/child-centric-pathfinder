-- Bloco A.1 v3: usa extensions.unaccent (schema padrão do Supabase)

CREATE TABLE public.comarcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comarcas_nome_normalizado_key UNIQUE (nome_normalizado),
  CONSTRAINT comarcas_nome_not_blank CHECK (length(btrim(nome)) > 0)
);

GRANT SELECT ON public.comarcas TO authenticated;
GRANT ALL    ON public.comarcas TO service_role;

ALTER TABLE public.comarcas ENABLE ROW LEVEL SECURITY;

CREATE POLICY comarcas_select_authenticated
  ON public.comarcas FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_comarcas_set_updated_at
  BEFORE UPDATE ON public.comarcas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.orgao_comarcas (
  orgao_execucao_id uuid NOT NULL REFERENCES public.orgaos_execucao(id) ON DELETE RESTRICT,
  comarca_id        uuid NOT NULL REFERENCES public.comarcas(id)        ON DELETE RESTRICT,
  is_principal      boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orgao_comarcas_pk PRIMARY KEY (orgao_execucao_id, comarca_id)
);

CREATE UNIQUE INDEX orgao_comarcas_one_principal_per_orgao
  ON public.orgao_comarcas (orgao_execucao_id) WHERE is_principal = true;

CREATE INDEX orgao_comarcas_by_comarca ON public.orgao_comarcas (comarca_id);

GRANT SELECT ON public.orgao_comarcas TO authenticated;
GRANT ALL    ON public.orgao_comarcas TO service_role;

ALTER TABLE public.orgao_comarcas ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgao_comarcas_select_authenticated
  ON public.orgao_comarcas FOR SELECT TO authenticated USING (true);

-- Helper de normalização (unaccent está no schema extensions no Supabase)
CREATE OR REPLACE FUNCTION private.normalize_comarca_nome(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(extensions.unaccent(coalesce(btrim(p_nome), '')), '\s+', ' ', 'g'))
$$;

-- Backfill
DO $backfill$
DECLARE
  r RECORD;
  v_comarca_id uuid;
BEGIN
  FOR r IN
    SELECT id, comarca, created_by
    FROM public.orgaos_execucao
    WHERE btrim(coalesce(comarca, '')) <> ''
  LOOP
    INSERT INTO public.comarcas (nome, nome_normalizado)
    VALUES (btrim(r.comarca), private.normalize_comarca_nome(r.comarca))
    ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_comarca_id;

    INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
    VALUES (r.id, v_comarca_id, true, coalesce(r.created_by, '00000000-0000-0000-0000-000000000000'::uuid))
    ON CONFLICT (orgao_execucao_id, comarca_id) DO NOTHING;
  END LOOP;
END
$backfill$;

-- admin_create_orgao_execucao (atualizada)
CREATE OR REPLACE FUNCTION public.admin_create_orgao_execucao(
  p_nome            text,
  p_comarca         text,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_nome         text := btrim(coalesce(p_nome, ''));
  v_comarca      text := btrim(coalesce(p_comarca, ''));
  v_nome_norm    text;
  v_comarca_norm text;
  v_orgao_id     uuid;
  v_comarca_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(v_nome) < 3    THEN RAISE EXCEPTION 'INVALID_NAME'    USING ERRCODE='22023'; END IF;
  IF length(v_comarca) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_nome_norm    := lower(regexp_replace(v_nome, '\s+', ' ', 'g'));
  v_comarca_norm := private.normalize_comarca_nome(v_comarca);

  SELECT id INTO v_orgao_id
    FROM public.orgaos_execucao
   WHERE nome_normalizado = v_nome_norm AND comarca_normalizada = v_comarca_norm
   LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'DUPLICATE_ORGAO' USING ERRCODE='23505'; END IF;

  INSERT INTO public.orgaos_execucao (nome, comarca, created_by)
  VALUES (v_nome, v_comarca, v_uid) RETURNING id INTO v_orgao_id;

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_comarca, v_comarca_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (v_orgao_id, v_comarca_id, true, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO NOTHING;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, metadata)
  VALUES (v_uid, 'orgao.created', 'orgao_execucao', v_orgao_id::text, 'success'::private.audit_result,
          jsonb_build_object('nome', v_nome, 'comarca', v_comarca));

  RETURN jsonb_build_object('success', true, 'orgao_id', v_orgao_id, 'comarca_id', v_comarca_id);
END
$$;

REVOKE ALL ON FUNCTION public.admin_create_orgao_execucao(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_orgao_execucao(text, text, text) TO authenticated;

-- admin_add_comarca_to_orgao
CREATE OR REPLACE FUNCTION public.admin_add_comarca_to_orgao(
  p_orgao_id        uuid,
  p_comarca_nome    text,
  p_is_principal    boolean DEFAULT false,
  p_idempotency_key uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := btrim(coalesce(p_comarca_nome, ''));
  v_norm text;
  v_comarca_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.tem_papel('admin_tecnico'::public.app_role)
       OR public.tem_papel('admin_institucional'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgaos_execucao WHERE id = p_orgao_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF length(v_nome) < 2 THEN RAISE EXCEPTION 'INVALID_COMARCA' USING ERRCODE='22023'; END IF;

  v_norm := private.normalize_comarca_nome(v_nome);

  INSERT INTO public.comarcas (nome, nome_normalizado)
  VALUES (v_nome, v_norm)
  ON CONFLICT (nome_normalizado) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_comarca_id;

  IF p_is_principal THEN
    UPDATE public.orgao_comarcas SET is_principal = false
     WHERE orgao_execucao_id = p_orgao_id AND is_principal = true;
  END IF;

  INSERT INTO public.orgao_comarcas (orgao_execucao_id, comarca_id, is_principal, created_by)
  VALUES (p_orgao_id, v_comarca_id, p_is_principal, v_uid)
  ON CONFLICT (orgao_execucao_id, comarca_id) DO UPDATE
    SET is_principal = EXCLUDED.is_principal OR public.orgao_comarcas.is_principal;

  INSERT INTO private.audit_events (actor_user_id, action, entity, entity_id, result, metadata)
  VALUES (v_uid, 'orgao.comarca_added', 'orgao_execucao', p_orgao_id::text, 'success'::private.audit_result,
          jsonb_build_object('comarca_id', v_comarca_id, 'is_principal', p_is_principal));

  RETURN jsonb_build_object('success', true, 'comarca_id', v_comarca_id);
END
$$;

REVOKE ALL ON FUNCTION public.admin_add_comarca_to_orgao(uuid, text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_comarca_to_orgao(uuid, text, boolean, uuid) TO authenticated;

-- buscar_orgaos_execucao
CREATE OR REPLACE FUNCTION public.buscar_orgaos_execucao(
  p_termo text DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_termo text := private.normalize_comarca_nome(coalesce(p_termo, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_result FROM (
    SELECT o.id, o.nome,
           coalesce(
             (SELECT jsonb_agg(jsonb_build_object(
                        'id', c.id, 'nome', c.nome, 'principal', oc.is_principal
                      ) ORDER BY oc.is_principal DESC, c.nome)
                FROM public.orgao_comarcas oc
                JOIN public.comarcas c ON c.id = oc.comarca_id
               WHERE oc.orgao_execucao_id = o.id),
             '[]'::jsonb
           ) AS comarcas
      FROM public.orgaos_execucao o
     WHERE v_termo = ''
        OR o.nome_normalizado ILIKE '%' || v_termo || '%'
        OR EXISTS (SELECT 1 FROM public.orgao_comarcas oc2
                     JOIN public.comarcas c2 ON c2.id = oc2.comarca_id
                    WHERE oc2.orgao_execucao_id = o.id
                      AND c2.nome_normalizado ILIKE '%' || v_termo || '%')
     ORDER BY o.nome
     LIMIT v_limit
  ) x;

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.buscar_orgaos_execucao(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_orgaos_execucao(text, integer) TO authenticated;