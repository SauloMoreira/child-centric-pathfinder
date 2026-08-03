-- Ajuste doc (novo AJUSTE 4) — "Tamanho do campo de resposta": nova
-- opção "Sempre longo", e o padrão passa de 'curto' para 'ambos'
-- ("Curto ou longo, conforme pergunta").

ALTER TABLE public.atendimento_ia_preferencias
  DROP CONSTRAINT IF EXISTS atendimento_ia_preferencias_campo_tipo_check;

ALTER TABLE public.atendimento_ia_preferencias
  ADD CONSTRAINT atendimento_ia_preferencias_campo_tipo_check
  CHECK (campo_tipo IN ('curto', 'longo', 'ambos'));

ALTER TABLE public.atendimento_ia_preferencias
  ALTER COLUMN campo_tipo SET DEFAULT 'ambos';

-- Atualiza obter_preferencias_atendimento_ia() — o padrão devolvido para
-- quem ainda não personalizou nada também passa a ser 'ambos'.
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
    RETURN jsonb_build_object(
      'campoTipo', 'ambos',
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

-- salvar_preferencias_atendimento_ia() precisa aceitar o novo valor 'longo'.
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
  IF p_campo_tipo NOT IN ('curto', 'longo', 'ambos') THEN
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
