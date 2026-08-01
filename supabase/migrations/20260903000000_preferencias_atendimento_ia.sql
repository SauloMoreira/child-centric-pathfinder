-- Ajuste doc (novo AJUSTE 13) — "Configurações opcionais" no Atendimento
-- IA: preferências por usuário, mantidas entre usos futuros.

CREATE TABLE IF NOT EXISTS public.atendimento_ia_preferencias (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campo_tipo          text NOT NULL DEFAULT 'curto' CHECK (campo_tipo IN ('curto', 'ambos')),
  respostas_obrigatorias boolean NOT NULL DEFAULT false,
  gerar_sugestoes     boolean NOT NULL DEFAULT true,
  exibir_justificativa boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atendimento_ia_preferencias ENABLE ROW LEVEL SECURITY;
-- Sem policy direta — acesso só via RPCs SECURITY DEFINER (mesmo padrão
-- já usado no resto do sistema).
REVOKE ALL ON public.atendimento_ia_preferencias FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obter_preferencias_atendimento_ia()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.atendimento_ia_preferencias;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_row FROM public.atendimento_ia_preferencias WHERE user_id = v_uid;
  IF v_row.user_id IS NULL THEN
    -- Ainda não personalizou: retorna os padrões definidos no doc, sem
    -- criar linha (só grava quando o usuário efetivamente muda algo).
    RETURN jsonb_build_object(
      'campoTipo', 'curto',
      'respostasObrigatorias', false,
      'gerarSugestoes', true,
      'exibirJustificativa', false
    );
  END IF;

  RETURN jsonb_build_object(
    'campoTipo', v_row.campo_tipo,
    'respostasObrigatorias', v_row.respostas_obrigatorias,
    'gerarSugestoes', v_row.gerar_sugestoes,
    'exibirJustificativa', v_row.exibir_justificativa
  );
END $fn$;

REVOKE ALL ON FUNCTION public.obter_preferencias_atendimento_ia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_preferencias_atendimento_ia() TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_preferencias_atendimento_ia(
  p_campo_tipo             text,
  p_respostas_obrigatorias boolean,
  p_gerar_sugestoes        boolean,
  p_exibir_justificativa   boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_campo_tipo NOT IN ('curto', 'ambos') THEN
    RAISE EXCEPTION 'INVALID_CAMPO_TIPO' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.atendimento_ia_preferencias
    (user_id, campo_tipo, respostas_obrigatorias, gerar_sugestoes, exibir_justificativa, updated_at)
  VALUES (v_uid, p_campo_tipo, p_respostas_obrigatorias, p_gerar_sugestoes, p_exibir_justificativa, now())
  ON CONFLICT (user_id) DO UPDATE
    SET campo_tipo = excluded.campo_tipo,
        respostas_obrigatorias = excluded.respostas_obrigatorias,
        gerar_sugestoes = excluded.gerar_sugestoes,
        exibir_justificativa = excluded.exibir_justificativa,
        updated_at = now();
END $fn$;

REVOKE ALL ON FUNCTION public.salvar_preferencias_atendimento_ia(text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_preferencias_atendimento_ia(text, boolean, boolean, boolean) TO authenticated;
