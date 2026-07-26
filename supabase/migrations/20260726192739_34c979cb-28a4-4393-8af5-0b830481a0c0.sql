
-- 1) enum categoria
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assistido_categoria_enum') THEN
    CREATE TYPE public.assistido_categoria_enum AS ENUM ('crianca_adolescente','adulto');
  END IF;
END $$;

-- 2) helper categoria
CREATE OR REPLACE FUNCTION private.calc_assistido_categoria(p_dob date)
RETURNS public.assistido_categoria_enum
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_dob IS NULL THEN NULL
    WHEN EXTRACT(YEAR FROM age(current_date, p_dob))::int >= 18
      THEN 'adulto'::public.assistido_categoria_enum
    ELSE 'crianca_adolescente'::public.assistido_categoria_enum
  END;
$$;
REVOKE ALL ON FUNCTION private.calc_assistido_categoria(date) FROM PUBLIC;

-- 3) colunas novas
ALTER TABLE public.assistidos
  ADD COLUMN IF NOT EXISTS prenome    text,
  ADD COLUMN IF NOT EXISTS sobrenome  text,
  ADD COLUMN IF NOT EXISTS cpf        text,
  ADD COLUMN IF NOT EXISTS nome_mae   text,
  ADD COLUMN IF NOT EXISTS nome_pai   text,
  ADD COLUMN IF NOT EXISTS foto_path  text,
  ADD COLUMN IF NOT EXISTS categoria  public.assistido_categoria_enum;

-- 4) backfill prenome/sobrenome a partir de nome_completo
UPDATE public.assistidos
   SET prenome   = COALESCE(prenome,   split_part(nome_completo, ' ', 1)),
       sobrenome = COALESCE(sobrenome, NULLIF(regexp_replace(nome_completo, '^\S+\s*', ''), ''))
 WHERE nome_completo IS NOT NULL
   AND (prenome IS NULL OR sobrenome IS NULL);

-- 5) backfill categoria a partir da data_nascimento
UPDATE public.assistidos
   SET categoria = private.calc_assistido_categoria(data_nascimento)
 WHERE categoria IS NULL
   AND data_nascimento IS NOT NULL;

-- 6) CHECKs (permite NULL nos legados; cadastro novo virá completo)
ALTER TABLE public.assistidos
  ADD CONSTRAINT assistidos_cpf_digits_chk
  CHECK (cpf IS NULL OR cpf ~ '^\d{11}$') NOT VALID;

-- 7) índice único parcial para CPF
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistidos_cpf_active
  ON public.assistidos (cpf)
  WHERE cpf IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assistidos_categoria
  ON public.assistidos (categoria)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assistidos_nome_mae_trgm
  ON public.assistidos USING gin (private.normalize_search_text(nome_mae) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- 8) atualizar trigger de preparação
CREATE OR REPLACE FUNCTION public.tg_assistidos_prepare()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_expected_cat public.assistido_categoria_enum;
BEGIN
  NEW.updated_at := now();

  -- normalizar prenome/sobrenome (espaços)
  IF NEW.prenome IS NOT NULL THEN
    NEW.prenome := regexp_replace(btrim(NEW.prenome), '\s+', ' ', 'g');
  END IF;
  IF NEW.sobrenome IS NOT NULL THEN
    NEW.sobrenome := regexp_replace(btrim(NEW.sobrenome), '\s+', ' ', 'g');
  END IF;

  -- recompor nome_completo se possível
  IF NEW.prenome IS NOT NULL AND NEW.sobrenome IS NOT NULL THEN
    NEW.nome_completo := NEW.prenome || ' ' || NEW.sobrenome;
  ELSIF NEW.nome_completo IS NOT NULL THEN
    NEW.nome_completo := regexp_replace(btrim(NEW.nome_completo), '\s+', ' ', 'g');
  END IF;

  -- normalizar nome_mae/nome_pai
  IF NEW.nome_mae IS NOT NULL THEN
    NEW.nome_mae := NULLIF(regexp_replace(btrim(NEW.nome_mae), '\s+', ' ', 'g'), '');
  END IF;
  IF NEW.nome_pai IS NOT NULL THEN
    NEW.nome_pai := NULLIF(regexp_replace(btrim(NEW.nome_pai), '\s+', ' ', 'g'), '');
  END IF;

  -- CPF: só dígitos
  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := NULLIF(regexp_replace(NEW.cpf, '\D', '', 'g'), '');
    IF NEW.cpf IS NOT NULL AND length(NEW.cpf) <> 11 THEN
      RAISE EXCEPTION 'CPF inválido (deve ter 11 dígitos).' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- rejeitar nascimento futuro
  IF NEW.data_nascimento IS NOT NULL AND NEW.data_nascimento > current_date THEN
    RAISE EXCEPTION 'Data de nascimento não pode ser futura.' USING ERRCODE = '22023';
  END IF;

  -- calcular categoria esperada e forçar coerência
  v_expected_cat := private.calc_assistido_categoria(NEW.data_nascimento);
  IF NEW.data_nascimento IS NOT NULL THEN
    IF NEW.categoria IS NULL THEN
      NEW.categoria := v_expected_cat;
    ELSIF NEW.categoria <> v_expected_cat THEN
      -- corrige silenciosamente para a categoria correta (fonte de verdade = data)
      NEW.categoria := v_expected_cat;
    END IF;
  END IF;

  -- search_text
  NEW.search_text := private.normalize_search_text(
    COALESCE(NEW.nome_completo,'') || ' ' ||
    COALESCE(NEW.nome_social,'')   || ' ' ||
    COALESCE(NEW.nome_mae,'')      || ' ' ||
    COALESCE(NEW.nome_pai,'')      || ' ' ||
    COALESCE(NEW.cpf,'')
  );

  RETURN NEW;
END $function$;

-- reaplica categoria consistente em legados via UPDATE dummy
UPDATE public.assistidos SET updated_at = updated_at WHERE data_nascimento IS NOT NULL;
