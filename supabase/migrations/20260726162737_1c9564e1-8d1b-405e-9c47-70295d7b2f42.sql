-- 0012: estrutura estendida de órgãos e RPC de criação administrativa

-- 1) Enum de situação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orgao_status') THEN
    CREATE TYPE public.orgao_status AS ENUM ('ativo','inativo');
  END IF;
END $$;

-- 2) Função utilitária de normalização (sem depender de unaccent)
CREATE OR REPLACE FUNCTION private.normalize_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          COALESCE(p,''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

-- 3) Ajustes de coluna
ALTER TABLE public.orgaos_execucao
  ALTER COLUMN sigla DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS estado char(2) NOT NULL DEFAULT 'RS',
  ADD COLUMN IF NOT EXISTS status public.orgao_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS area_atuacao text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS nome_normalizado text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS inactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivated_by uuid REFERENCES auth.users(id);

-- Remove constraints antigas restritivas (troca por índices flexíveis)
ALTER TABLE public.orgaos_execucao
  DROP CONSTRAINT IF EXISTS orgaos_execucao_nome_key,
  DROP CONSTRAINT IF EXISTS orgaos_execucao_sigla_key;

-- Backfill (tabela vazia, mas seguro)
UPDATE public.orgaos_execucao
   SET municipio = COALESCE(municipio, cidade, comarca, 'Não informado'),
       nome_normalizado = COALESCE(nome_normalizado, private.normalize_text(nome)),
       created_by = COALESCE(created_by, criado_por),
       status = CASE WHEN ativo THEN 'ativo'::public.orgao_status ELSE 'inativo'::public.orgao_status END,
       estado = COALESCE(NULLIF(estado,''), uf, 'RS');

ALTER TABLE public.orgaos_execucao
  ALTER COLUMN municipio SET NOT NULL,
  ALTER COLUMN nome_normalizado SET NOT NULL;

-- 4) Índices
CREATE UNIQUE INDEX IF NOT EXISTS uq_orgaos_execucao_sigla_notnull
  ON public.orgaos_execucao (upper(sigla)) WHERE sigla IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orgaos_execucao_nome_normalizado
  ON public.orgaos_execucao (nome_normalizado);
CREATE INDEX IF NOT EXISTS ix_orgaos_execucao_comarca ON public.orgaos_execucao (comarca);
CREATE INDEX IF NOT EXISTS ix_orgaos_execucao_municipio ON public.orgaos_execucao (municipio);
CREATE INDEX IF NOT EXISTS ix_orgaos_execucao_status ON public.orgaos_execucao (status);

-- 5) Trigger de sincronização legado <-> novo (mantém código antigo funcionando)
CREATE OR REPLACE FUNCTION public.tg_orgaos_execucao_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Sincroniza municipio <-> cidade
  IF NEW.municipio IS NULL AND NEW.cidade IS NOT NULL THEN NEW.municipio := NEW.cidade; END IF;
  IF NEW.cidade IS NULL AND NEW.municipio IS NOT NULL THEN NEW.cidade := NEW.municipio; END IF;
  -- estado <-> uf
  IF NEW.estado IS NULL AND NEW.uf IS NOT NULL THEN NEW.estado := NEW.uf; END IF;
  IF (NEW.uf IS NULL OR NEW.uf = '') AND NEW.estado IS NOT NULL THEN NEW.uf := NEW.estado; END IF;
  -- status <-> ativo
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM COALESCE(OLD.status, 'ativo'::public.orgao_status) THEN
    NEW.ativo := (NEW.status = 'ativo');
  ELSIF NEW.ativo IS DISTINCT FROM COALESCE(OLD.ativo, true) THEN
    NEW.status := CASE WHEN NEW.ativo THEN 'ativo'::public.orgao_status ELSE 'inativo'::public.orgao_status END;
  END IF;
  -- created_by <-> criado_por
  IF NEW.created_by IS NULL AND NEW.criado_por IS NOT NULL THEN NEW.created_by := NEW.criado_por; END IF;
  IF NEW.criado_por IS NULL AND NEW.created_by IS NOT NULL THEN NEW.criado_por := NEW.created_by; END IF;
  -- nome_normalizado sempre coerente
  IF NEW.nome_normalizado IS NULL OR (TG_OP = 'UPDATE' AND NEW.nome IS DISTINCT FROM OLD.nome) THEN
    NEW.nome_normalizado := private.normalize_text(NEW.nome);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orgaos_execucao_sync ON public.orgaos_execucao;
CREATE TRIGGER trg_orgaos_execucao_sync
BEFORE INSERT OR UPDATE ON public.orgaos_execucao
FOR EACH ROW EXECUTE FUNCTION public.tg_orgaos_execucao_sync();

-- 6) Tabela de idempotência (curta, TTL de 24h por limpeza futura)
CREATE TABLE IF NOT EXISTS private.admin_idempotency (
  key text PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7) RPC admin_create_orgao_execucao
CREATE OR REPLACE FUNCTION public.admin_create_orgao_execucao(
  p_nome text,
  p_sigla text,
  p_comarca text,
  p_municipio text,
  p_estado text,
  p_area_atuacao text,
  p_descricao text,
  p_status public.orgao_status DEFAULT 'ativo',
  p_duplicate_override_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_is_tecnico boolean;
  v_is_inst boolean;
  v_actor_role public.app_role;
  v_nome text;
  v_sigla text;
  v_comarca text;
  v_municipio text;
  v_estado text;
  v_area text;
  v_desc text;
  v_nome_norm text;
  v_dup jsonb;
  v_orgao_id uuid;
  v_existing_entity uuid;
  v_corr uuid := gen_random_uuid();
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

  -- Verifica perfil ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = v_uid AND status = 'ativo' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Perfil não está ativo.' USING ERRCODE = '42501';
  END IF;

  -- Idempotência
  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT entity_id INTO v_existing_entity
      FROM private.admin_idempotency
     WHERE key = btrim(p_idempotency_key) AND user_id = v_uid AND action = 'organization.create';
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'orgao_id', v_existing_entity);
    END IF;
  END IF;

  -- Normalização
  v_nome := regexp_replace(btrim(COALESCE(p_nome,'')), '\s+', ' ', 'g');
  v_sigla := NULLIF(upper(btrim(COALESCE(p_sigla,''))), '');
  v_comarca := regexp_replace(btrim(COALESCE(p_comarca,'')), '\s+', ' ', 'g');
  v_municipio := regexp_replace(btrim(COALESCE(p_municipio,'')), '\s+', ' ', 'g');
  v_estado := COALESCE(NULLIF(upper(btrim(COALESCE(p_estado,''))),''), 'RS');
  v_area := NULLIF(btrim(COALESCE(p_area_atuacao,'')), '');
  v_desc := NULLIF(btrim(COALESCE(p_descricao,'')), '');
  v_nome_norm := private.normalize_text(v_nome);

  -- Validações
  IF length(v_nome) < 5 THEN
    RAISE EXCEPTION 'Nome oficial deve ter ao menos 5 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Nome oficial não pode exceder 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_sigla IS NOT NULL AND length(v_sigla) > 30 THEN
    RAISE EXCEPTION 'Sigla não pode exceder 30 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_comarca IS NULL OR length(v_comarca) < 2 OR length(v_comarca) > 120 THEN
    RAISE EXCEPTION 'Comarca é obrigatória (2 a 120 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF v_municipio IS NULL OR length(v_municipio) < 2 OR length(v_municipio) > 120 THEN
    RAISE EXCEPTION 'Município é obrigatório (2 a 120 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF v_desc IS NOT NULL AND length(v_desc) > 1000 THEN
    RAISE EXCEPTION 'Descrição não pode exceder 1000 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_desc IS NOT NULL AND v_desc ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'Descrição não pode conter marcações HTML.' USING ERRCODE = '22023';
  END IF;

  -- Sigla duplicada é sempre bloqueada
  IF v_sigla IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orgaos_execucao WHERE upper(sigla) = v_sigla
  ) THEN
    RAISE EXCEPTION 'Sigla % já está em uso.', v_sigla USING ERRCODE = '23505';
  END IF;

  -- Duplicidade por semelhança (nome normalizado, comarca, município)
  SELECT jsonb_agg(jsonb_build_object(
    'id', o.id, 'nome', o.nome, 'sigla', o.sigla,
    'comarca', o.comarca, 'municipio', o.municipio, 'status', o.status
  ))
    INTO v_dup
    FROM public.orgaos_execucao o
   WHERE o.nome_normalizado = v_nome_norm
      OR (private.normalize_text(o.comarca) = private.normalize_text(v_comarca)
          AND private.normalize_text(o.municipio) = private.normalize_text(v_municipio)
          AND private.normalize_text(o.nome) LIKE '%' || split_part(v_nome_norm,' ',1) || '%');

  IF v_dup IS NOT NULL AND jsonb_array_length(v_dup) > 0 THEN
    IF p_duplicate_override_reason IS NULL OR length(btrim(p_duplicate_override_reason)) < 10 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'possible_duplicates',
        'message', 'Encontramos órgãos possivelmente semelhantes. Revise antes de confirmar.',
        'duplicates', v_dup
      );
    END IF;
  END IF;

  -- Criação
  INSERT INTO public.orgaos_execucao (
    nome, sigla, comarca, municipio, cidade, estado, uf,
    area_atuacao, descricao, status, ativo,
    nome_normalizado, created_by, criado_por
  ) VALUES (
    v_nome, v_sigla, v_comarca, v_municipio, v_municipio, v_estado, v_estado,
    v_area, v_desc, COALESCE(p_status,'ativo'::public.orgao_status),
    (COALESCE(p_status,'ativo'::public.orgao_status) = 'ativo'),
    v_nome_norm, v_uid, v_uid
  )
  RETURNING id INTO v_orgao_id;

  -- Idempotência: grava chave
  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    INSERT INTO private.admin_idempotency (key, user_id, action, entity_id)
    VALUES (btrim(p_idempotency_key), v_uid, 'organization.create', v_orgao_id);
  END IF;

  -- Auditoria
  PERFORM private.log_audit_event(
    'organization.created','orgao_execucao', v_orgao_id::text,
    'sucesso', NULL,
    jsonb_build_object(
      'nome', v_nome, 'sigla', v_sigla, 'comarca', v_comarca,
      'municipio', v_municipio, 'estado', v_estado,
      'area_atuacao', v_area, 'status', COALESCE(p_status,'ativo'::public.orgao_status),
      'duplicate_override_reason', p_duplicate_override_reason
    ),
    v_orgao_id, v_corr, v_actor_role
  );

  RETURN jsonb_build_object('ok', true, 'orgao_id', v_orgao_id, 'correlation_id', v_corr);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_orgao_execucao(text,text,text,text,text,text,text,public.orgao_status,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_orgao_execucao(text,text,text,text,text,text,text,public.orgao_status,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_orgao_execucao(text,text,text,text,text,text,text,public.orgao_status,text,text) TO authenticated;
