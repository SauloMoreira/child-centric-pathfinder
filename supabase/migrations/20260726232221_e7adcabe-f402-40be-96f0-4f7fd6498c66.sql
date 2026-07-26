-- 1) get_workspace_column_assistidos: incluir data_nascimento
CREATE OR REPLACE FUNCTION public.get_workspace_column_assistidos(
  p_column_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_col RECORD; v_org uuid; v_result jsonb;
  v_lim int; v_off int;
BEGIN
  SELECT c.*, w.orgao_execucao_id AS org_id
    INTO v_col
    FROM private.orgao_workspace_columns c
    JOIN private.orgao_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLUMN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_org := v_col.org_id;
  IF NOT private.user_can_read_org_workspace(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_lim := greatest(1, least(coalesce(p_limit, 20), 200));
  v_off := greatest(0, coalesce(p_offset, 0));

  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'nome_completo', x.nome_completo,
          'nome_social', x.nome_social,
          'data_nascimento', x.data_nascimento,
          'idade', x.idade,
          'faixa_etaria', x.faixa_etaria,
          'sexo_registral', x.sexo_registral,
          'foto_url', x.foto_url,
          'situacao_atual', x.situacao_atual,
          'orgao_execucao_id', x.orgao_execucao_id,
          'entidade_acolhimento', x.entidade_acolhimento,
          'tipo_acolhimento', x.tipo_acolhimento,
          'tempo_acolhimento_dias', x.tempo_acolhimento_dias,
          'proxima_reavaliacao', x.proxima_reavaliacao,
          'processos_ativos', x.processos_ativos,
          'prazo_processo_mais_proximo', x.prazo_processo_mais_proximo,
          'providencias_pendentes', x.providencias_pendentes,
          'prazo_providencia_mais_proximo', x.prazo_providencia_mais_proximo,
          'total_familiares', x.total_familiares,
          'total_irmaos', x.total_irmaos,
          'familiar_dpe', x.familiar_dpe,
          'updated_at', x.updated_at
        )
        ORDER BY x.updated_at DESC
      )
      FROM (
        SELECT v.*
          FROM public.v_assistidos_card v
          JOIN public.assistidos a ON a.id = v.id
         WHERE v.orgao_execucao_id = v_org
           AND a.categoria = 'crianca_adolescente'
         ORDER BY v.updated_at DESC
         LIMIT v_lim
         OFFSET v_off
      ) x
    ), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM public.assistidos a
       WHERE a.deleted_at IS NULL
         AND a.orgao_execucao_id = v_org
         AND a.categoria = 'crianca_adolescente'
    )
  ) INTO v_result;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_column_assistidos(uuid, integer, integer) TO authenticated;

-- 2) remover_foto_assistido: limpa foto_path/foto_url e retorna o caminho anterior
CREATE OR REPLACE FUNCTION public.remover_foto_assistido(p_assistido_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_prev_path text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_can_access_assistido(p_assistido_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  UPDATE public.assistidos
     SET foto_path = NULL, foto_url = NULL, updated_by = v_uid
   WHERE id = p_assistido_id AND deleted_at IS NULL
   RETURNING orgao_execucao_id, (SELECT foto_path FROM public.assistidos WHERE id = p_assistido_id)
        INTO v_org, v_prev_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NOT_FOUND' USING ERRCODE='02000';
  END IF;

  PERFORM private.log_audit_event('assistido.photo_removed','assistido', p_assistido_id::text,
    'sucesso', NULL, NULL, v_org, NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'previous_path', v_prev_path);
END $$;

REVOKE ALL ON FUNCTION public.remover_foto_assistido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_foto_assistido(uuid) TO authenticated;