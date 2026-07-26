DROP VIEW IF EXISTS public.v_assistidos_card CASCADE;

CREATE VIEW public.v_assistidos_card
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.nome_completo,
  a.nome_social,
  a.data_nascimento,
  date_part('year', age(a.data_nascimento))::int AS idade,
  CASE
    WHEN date_part('year', age(a.data_nascimento)) < 12 THEN 'crianca'
    WHEN date_part('year', age(a.data_nascimento)) < 18 THEN 'adolescente'
    ELSE NULL
  END AS faixa_etaria,
  a.sexo_registral,
  a.genero,
  a.foto_url,
  a.situacao_atual,
  a.orgao_execucao_id,
  a.responsavel_user_id,
  a.updated_at,
  (SELECT ac.id FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS acolhimento_ativo_id,
  (SELECT ac.entidade_nome FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS entidade_acolhimento,
  (SELECT ac.tipo FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tipo_acolhimento,
  (SELECT (CURRENT_DATE - ac.data_ingresso)::int
     FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS tempo_acolhimento_dias,
  (SELECT ac.data_reavaliacao FROM public.assistido_acolhimentos ac
    WHERE ac.assistido_id = a.id AND ac.data_saida IS NULL
    ORDER BY ac.data_ingresso DESC LIMIT 1) AS proxima_reavaliacao,
  (SELECT COUNT(*)::int FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao = 'ativo') AS processos_ativos,
  (SELECT MIN(p.prazo_proximo) FROM public.assistido_processos p
    WHERE p.assistido_id = a.id AND p.situacao='ativo' AND p.prazo_proximo IS NOT NULL) AS prazo_processo_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL) AS providencias_pendentes,
  (SELECT MIN(pr.prazo) FROM public.assistido_providencias pr
    WHERE pr.assistido_id = a.id AND pr.concluida_em IS NULL AND pr.prazo IS NOT NULL) AS prazo_providencia_mais_proximo,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS total_familiares,
  (SELECT COUNT(*)::int FROM public.assistido_familiares f WHERE f.assistido_id = a.id
     AND f.parentesco IN ('irmao','irma')) AS total_irmaos,
  (SELECT BOOL_OR(f.assistido_pela_dpe) FROM public.assistido_familiares f WHERE f.assistido_id = a.id) AS familiar_dpe,
  a.search_text,
  a.foto_path
FROM public.assistidos a
WHERE a.deleted_at IS NULL;

GRANT SELECT ON public.v_assistidos_card TO authenticated;

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
          'foto_path', x.foto_path,
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