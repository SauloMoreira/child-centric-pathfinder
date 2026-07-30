-- Ajuste doc — Atendimento IA: o campo "Contexto" deixa de ser só texto
-- livre. O usuário poderá salvar o contexto elaborado/escrito para
-- reutilização futura em novos atendimentos, mediante indicação de um
-- nome, tornando-se uma opção a ser selecionada. Contextos salvos podem
-- ser excluídos. Contextos salvos e excluídos são sempre vinculados
-- apenas ao próprio usuário (não são compartilhados entre Defensores).
--
-- Acesso apenas via RPCs SECURITY DEFINER (sem policy de RLS direta na
-- tabela) — mesmo padrão de isolamento por auth.uid() já usado no restante
-- do sistema.

CREATE TABLE public.atendimento_ia_contextos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  texto       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atendimento_ia_contextos_nome_nao_vazio CHECK (btrim(nome) <> ''),
  CONSTRAINT atendimento_ia_contextos_texto_nao_vazio CHECK (btrim(texto) <> ''),
  CONSTRAINT atendimento_ia_contextos_user_nome_uniq UNIQUE (user_id, nome)
);

CREATE INDEX atendimento_ia_contextos_user_id_idx
  ON public.atendimento_ia_contextos (user_id, created_at DESC);

ALTER TABLE public.atendimento_ia_contextos ENABLE ROW LEVEL SECURITY;
-- Sem policies: toda leitura/escrita passa pelas RPCs SECURITY DEFINER abaixo.
REVOKE ALL ON public.atendimento_ia_contextos FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_contextos_atendimento_ia()
RETURNS TABLE (id uuid, nome text, texto text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $fn$
  SELECT c.id, c.nome, c.texto
    FROM public.atendimento_ia_contextos c
   WHERE c.user_id = auth.uid()
   ORDER BY c.created_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.listar_contextos_atendimento_ia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_contextos_atendimento_ia() TO authenticated;

-- ---------------------------------------------------------------------------
-- Salva (ou atualiza, se já existir um contexto com o mesmo nome para o
-- usuário) um contexto para reutilização futura.
CREATE OR REPLACE FUNCTION public.salvar_contexto_atendimento_ia(
  p_nome  text,
  p_texto text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_nome  text := btrim(p_nome);
  v_texto text := btrim(p_texto);
  v_id    uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF v_nome = '' OR v_texto = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.atendimento_ia_contextos (user_id, nome, texto)
  VALUES (v_actor, v_nome, v_texto)
  ON CONFLICT (user_id, nome)
  DO UPDATE SET texto = excluded.texto, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION public.salvar_contexto_atendimento_ia(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_contexto_atendimento_ia(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excluir_contexto_atendimento_ia(
  p_context_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_deleted uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

  DELETE FROM public.atendimento_ia_contextos
   WHERE id = p_context_id AND user_id = v_actor
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.excluir_contexto_atendimento_ia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_contexto_atendimento_ia(uuid) TO authenticated;
