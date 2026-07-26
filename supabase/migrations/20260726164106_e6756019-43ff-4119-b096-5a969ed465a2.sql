
-- 0013: Simplificação do cadastro de órgãos (nome + comarca)

-- Extensão para normalização (remoção de acentos)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Remover trigger e função de sincronização legada
DROP TRIGGER IF EXISTS trg_orgaos_execucao_sync ON public.orgaos_execucao;
DROP FUNCTION IF EXISTS public.tg_orgaos_execucao_sync();

-- Remover assinatura antiga da RPC de criação
DROP FUNCTION IF EXISTS public.admin_create_orgao_execucao(text,text,text,text,text,text,text,public.orgao_status,text,text);

-- Backfill created_by a partir de criado_por
UPDATE public.orgaos_execucao SET created_by = criado_por WHERE created_by IS NULL AND criado_por IS NOT NULL;

-- Remover política que referencia coluna "ativo"
DROP POLICY IF EXISTS orgaos_execucao_select_authenticated ON public.orgaos_execucao;

-- Remover colunas descontinuadas
ALTER TABLE public.orgaos_execucao
  DROP COLUMN IF EXISTS sigla,
  DROP COLUMN IF EXISTS cidade,
  DROP COLUMN IF EXISTS uf,
  DROP COLUMN IF EXISTS ativo,
  DROP COLUMN IF EXISTS criado_por,
  DROP COLUMN IF EXISTS municipio,
  DROP COLUMN IF EXISTS estado,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS area_atuacao,
  DROP COLUMN IF EXISTS descricao,
  DROP COLUMN IF EXISTS inactivated_at,
  DROP COLUMN IF EXISTS inactivated_by;

-- Enum não é mais utilizado
DROP TYPE IF EXISTS public.orgao_status;

-- Função de normalização reutilizável
CREATE OR REPLACE FUNCTION private.normalize_search_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(extensions.unaccent(regexp_replace(btrim(coalesce(p_value,'')), '\s+', ' ', 'g')));
$$;

REVOKE ALL ON FUNCTION private.normalize_search_text(text) FROM PUBLIC;

-- Coluna normalizada de comarca
ALTER TABLE public.orgaos_execucao
  ADD COLUMN IF NOT EXISTS comarca_normalizada text;

-- Backfill dos campos normalizados
UPDATE public.orgaos_execucao
   SET nome = regexp_replace(btrim(nome), '\s+', ' ', 'g'),
       comarca = regexp_replace(btrim(coalesce(comarca,'')), '\s+', ' ', 'g');

UPDATE public.orgaos_execucao
   SET nome_normalizado = private.normalize_search_text(nome),
       comarca_normalizada = private.normalize_search_text(comarca);

-- Remover eventuais linhas sem comarca (dados de dev)
DELETE FROM public.orgaos_execucao WHERE comarca IS NULL OR btrim(comarca) = '';

-- NOT NULL definitivos
ALTER TABLE public.orgaos_execucao
  ALTER COLUMN comarca SET NOT NULL,
  ALTER COLUMN comarca_normalizada SET NOT NULL,
  ALTER COLUMN nome_normalizado SET NOT NULL;

-- Índice único pela combinação normalizada
DROP INDEX IF EXISTS public.uq_orgao_nome_comarca;
DROP INDEX IF EXISTS public.orgaos_execucao_nome_normalizado_key;
CREATE UNIQUE INDEX uq_orgao_nome_comarca
  ON public.orgaos_execucao (nome_normalizado, comarca_normalizada);

-- Trigger de normalização/updated_at
CREATE OR REPLACE FUNCTION public.tg_orgaos_execucao_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.nome := regexp_replace(btrim(coalesce(NEW.nome,'')), '\s+', ' ', 'g');
  NEW.comarca := regexp_replace(btrim(coalesce(NEW.comarca,'')), '\s+', ' ', 'g');
  NEW.nome_normalizado := private.normalize_search_text(NEW.nome);
  NEW.comarca_normalizada := private.normalize_search_text(NEW.comarca);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgaos_execucao_normalize
  BEFORE INSERT OR UPDATE ON public.orgaos_execucao
  FOR EACH ROW EXECUTE FUNCTION public.tg_orgaos_execucao_normalize();

-- Política: qualquer usuário autenticado pode consultar órgãos
CREATE POLICY orgaos_execucao_select_authenticated
  ON public.orgaos_execucao FOR SELECT TO authenticated
  USING (true);

-- RPC de criação (nome + comarca)
CREATE OR REPLACE FUNCTION public.admin_create_orgao_execucao(
  p_nome text,
  p_comarca text,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_tecnico boolean;
  v_is_inst boolean;
  v_actor_role public.app_role;
  v_nome text;
  v_comarca text;
  v_nome_norm text;
  v_comarca_norm text;
  v_existing_id uuid;
  v_orgao_id uuid;
  v_corr uuid := gen_random_uuid();
  v_existing_row public.orgaos_execucao%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  v_is_tecnico := private.is_admin_tecnico();
  v_is_inst := private.current_user_is_admin();

  IF NOT (v_is_tecnico OR v_is_inst) THEN
    RAISE EXCEPTION 'Criação de órgão restrita a Administrador Técnico ou Institucional.'
      USING ERRCODE = '42501';
  END IF;

  IF v_is_tecnico AND NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para o Administrador Técnico criar órgãos.'
      USING ERRCODE = '42501';
  END IF;

  v_actor_role := CASE WHEN v_is_tecnico THEN 'admin_tecnico'::public.app_role
                       ELSE 'admin_institucional'::public.app_role END;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = v_uid AND status = 'ativo' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Perfil não está ativo.' USING ERRCODE = '42501';
  END IF;

  -- Idempotência
  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT entity_id INTO v_existing_id
      FROM private.admin_idempotency
     WHERE key = btrim(p_idempotency_key)
       AND user_id = v_uid
       AND action = 'organization.create';
    IF FOUND THEN
      SELECT * INTO v_existing_row FROM public.orgaos_execucao WHERE id = v_existing_id;
      RETURN jsonb_build_object(
        'ok', true, 'idempotent', true,
        'orgao', jsonb_build_object(
          'id', v_existing_row.id,
          'nome', v_existing_row.nome,
          'comarca', v_existing_row.comarca,
          'created_at', v_existing_row.created_at,
          'updated_at', v_existing_row.updated_at
        )
      );
    END IF;
  END IF;

  v_nome := regexp_replace(btrim(coalesce(p_nome,'')), '\s+', ' ', 'g');
  v_comarca := regexp_replace(btrim(coalesce(p_comarca,'')), '\s+', ' ', 'g');

  IF length(v_nome) < 5 OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Nome do órgão deve ter entre 5 e 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_comarca) < 2 OR length(v_comarca) > 120 THEN
    RAISE EXCEPTION 'Comarca deve ter entre 2 e 120 caracteres.' USING ERRCODE = '22023';
  END IF;

  v_nome_norm := private.normalize_search_text(v_nome);
  v_comarca_norm := private.normalize_search_text(v_comarca);

  SELECT id INTO v_existing_id FROM public.orgaos_execucao
   WHERE nome_normalizado = v_nome_norm
     AND comarca_normalizada = v_comarca_norm;
  IF FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_EXISTS'
      USING ERRCODE = '23505', HINT = v_existing_id::text;
  END IF;

  INSERT INTO public.orgaos_execucao (nome, comarca, created_by, updated_by)
  VALUES (v_nome, v_comarca, v_uid, v_uid)
  RETURNING id INTO v_orgao_id;

  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    INSERT INTO private.admin_idempotency (key, user_id, action, entity_id)
    VALUES (btrim(p_idempotency_key), v_uid, 'organization.create', v_orgao_id);
  END IF;

  PERFORM private.log_audit_event(
    'organization.created', 'orgao_execucao', v_orgao_id::text,
    'sucesso', NULL,
    jsonb_build_object(
      'nome', v_nome,
      'comarca', v_comarca,
      'changed_fields', jsonb_build_array('nome','comarca')
    ),
    v_orgao_id, v_corr, v_actor_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'orgao', jsonb_build_object(
      'id', v_orgao_id,
      'nome', v_nome,
      'comarca', v_comarca,
      'created_at', now(),
      'updated_at', now()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_orgao_execucao(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_orgao_execucao(text,text,text) TO authenticated;

-- RPC de edição (preserva o mesmo UUID)
CREATE OR REPLACE FUNCTION public.admin_update_orgao_execucao(
  p_id uuid,
  p_nome text,
  p_comarca text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_tecnico boolean;
  v_is_inst boolean;
  v_actor_role public.app_role;
  v_nome text; v_comarca text;
  v_nome_norm text; v_comarca_norm text;
  v_existing_id uuid;
  v_old public.orgaos_execucao%ROWTYPE;
  v_changed jsonb := '[]'::jsonb;
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  v_is_tecnico := private.is_admin_tecnico();
  v_is_inst := private.current_user_is_admin();

  IF NOT (v_is_tecnico OR v_is_inst) THEN
    RAISE EXCEPTION 'Edição de órgão restrita a Administrador Técnico ou Institucional.'
      USING ERRCODE = '42501';
  END IF;

  IF v_is_tecnico AND NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para editar órgãos.' USING ERRCODE = '42501';
  END IF;

  v_actor_role := CASE WHEN v_is_tecnico THEN 'admin_tecnico'::public.app_role
                       ELSE 'admin_institucional'::public.app_role END;

  SELECT * INTO v_old FROM public.orgaos_execucao WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Órgão não encontrado.' USING ERRCODE = '02000';
  END IF;

  v_nome := regexp_replace(btrim(coalesce(p_nome,'')), '\s+', ' ', 'g');
  v_comarca := regexp_replace(btrim(coalesce(p_comarca,'')), '\s+', ' ', 'g');

  IF length(v_nome) < 5 OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Nome do órgão deve ter entre 5 e 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_comarca) < 2 OR length(v_comarca) > 120 THEN
    RAISE EXCEPTION 'Comarca deve ter entre 2 e 120 caracteres.' USING ERRCODE = '22023';
  END IF;

  v_nome_norm := private.normalize_search_text(v_nome);
  v_comarca_norm := private.normalize_search_text(v_comarca);

  SELECT id INTO v_existing_id FROM public.orgaos_execucao
   WHERE nome_normalizado = v_nome_norm
     AND comarca_normalizada = v_comarca_norm
     AND id <> p_id;
  IF FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_EXISTS'
      USING ERRCODE = '23505', HINT = v_existing_id::text;
  END IF;

  IF v_old.nome IS DISTINCT FROM v_nome THEN
    v_changed := v_changed || to_jsonb('nome'::text);
  END IF;
  IF v_old.comarca IS DISTINCT FROM v_comarca THEN
    v_changed := v_changed || to_jsonb('comarca'::text);
  END IF;

  UPDATE public.orgaos_execucao
     SET nome = v_nome,
         comarca = v_comarca,
         updated_by = v_uid
   WHERE id = p_id;

  PERFORM private.log_audit_event(
    'organization.updated', 'orgao_execucao', p_id::text,
    'sucesso', NULL,
    jsonb_build_object(
      'nome', v_nome,
      'comarca', v_comarca,
      'changed_fields', v_changed
    ),
    p_id, v_corr, v_actor_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'orgao', jsonb_build_object('id', p_id, 'nome', v_nome, 'comarca', v_comarca)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_orgao_execucao(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_orgao_execucao(uuid,text,text) TO authenticated;

-- Ajustar aprovar_solicitacao_acesso ao novo modelo (nome + comarca)
CREATE OR REPLACE FUNCTION public.aprovar_solicitacao_acesso(
  p_request_id uuid,
  p_version integer,
  p_orgao_final_id uuid,
  p_criar_novo boolean DEFAULT false,
  p_novo_orgao jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req private.access_requests%ROWTYPE;
  v_orgao_id uuid;
  v_actor_role public.app_role;
  v_nome text; v_comarca text;
  v_nome_norm text; v_comarca_norm text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF private.is_admin_tecnico() THEN
    v_actor_role := 'admin_tecnico';
  ELSIF private.current_user_is_admin() THEN
    v_actor_role := 'admin_institucional';
  ELSE
    RAISE EXCEPTION 'Ação restrita a administrador institucional ou técnico.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para aprovar solicitações.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM private.access_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '02000';
  END IF;
  IF v_req.status = 'aprovada' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status','aprovada');
  END IF;
  IF v_req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitação em estado % não pode ser aprovada.', v_req.status
      USING ERRCODE = '22023';
  END IF;
  IF v_req.version <> p_version THEN
    RAISE EXCEPTION 'Solicitação foi modificada por outro processo. Recarregue.'
      USING ERRCODE = '40001';
  END IF;

  IF p_criar_novo THEN
    v_nome := regexp_replace(btrim(coalesce(p_novo_orgao->>'nome','')), '\s+', ' ', 'g');
    v_comarca := regexp_replace(btrim(coalesce(p_novo_orgao->>'comarca','')), '\s+', ' ', 'g');
    IF length(v_nome) < 5 OR length(v_comarca) < 2 THEN
      RAISE EXCEPTION 'Novo órgão exige nome (mín. 5) e comarca (mín. 2).' USING ERRCODE = '22023';
    END IF;
    v_nome_norm := private.normalize_search_text(v_nome);
    v_comarca_norm := private.normalize_search_text(v_comarca);

    SELECT id INTO v_orgao_id FROM public.orgaos_execucao
     WHERE nome_normalizado = v_nome_norm AND comarca_normalizada = v_comarca_norm;
    IF NOT FOUND THEN
      INSERT INTO public.orgaos_execucao (nome, comarca, created_by, updated_by)
      VALUES (v_nome, v_comarca, v_uid, v_uid)
      RETURNING id INTO v_orgao_id;
    END IF;
  ELSE
    IF p_orgao_final_id IS NULL THEN
      RAISE EXCEPTION 'Órgão final é obrigatório.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_orgao_id FROM public.orgaos_execucao WHERE id = p_orgao_final_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Órgão final inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO private.user_roles (user_id, role, granted_by, correlation_id)
  VALUES (v_req.user_id, 'defensor_publico', v_uid, v_req.correlation_id)
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL;

  UPDATE private.user_org_memberships
     SET ativo = false, until = now(), ended_by = v_uid,
         motivo_encerramento = 'substituido_por_nova_aprovacao'
   WHERE user_id = v_req.user_id AND ativo = true;

  INSERT INTO private.user_org_memberships (user_id, orgao_id, granted_by, correlation_id)
  VALUES (v_req.user_id, v_orgao_id, v_uid, v_req.correlation_id);

  UPDATE public.profiles
     SET status = 'ativo', ativo = true, updated_at = now()
   WHERE user_id = v_req.user_id;

  UPDATE private.access_requests
     SET status = 'aprovada', version = version + 1, decidido_por = v_uid,
         decidido_em = now(), orgao_final_id = v_orgao_id, updated_at = now()
   WHERE id = p_request_id;

  PERFORM private.log_audit_event(
    'access_request.approve', 'access_request', p_request_id::text,
    'sucesso',
    jsonb_build_object('status', jsonb_build_object('from', v_req.status, 'to','aprovada')),
    jsonb_build_object('orgao_final_id', v_orgao_id, 'novo_orgao', p_criar_novo),
    v_orgao_id, v_req.correlation_id, v_actor_role
  );

  RETURN jsonb_build_object('ok', true, 'status','aprovada', 'orgao_id', v_orgao_id);
END;
$$;
