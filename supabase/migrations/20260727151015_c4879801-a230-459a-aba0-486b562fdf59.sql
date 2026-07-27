-- Gate 1: Quarantine legacy assistidos/processos/workspace domain
-- Non-destructive: only permission revocations and policy replacement.
REVOKE ALL ON public.assistidos             FROM anon, authenticated;
REVOKE ALL ON public.assistido_familiares   FROM anon, authenticated;
REVOKE ALL ON public.assistido_processos    FROM anon, authenticated;
REVOKE ALL ON public.assistido_acolhimentos FROM anon, authenticated;
REVOKE ALL ON public.assistido_providencias FROM anon, authenticated;
REVOKE ALL ON public.assistido_vinculos     FROM anon, authenticated;
REVOKE ALL ON public.processos              FROM anon, authenticated;
REVOKE ALL ON public.processo_assistidos    FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.atualizar_anotacoes_assistido(p_assistido_id uuid, p_observacoes text)                                                                                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_assistido_adulto(p_assistido_id uuid, p_payload jsonb)                                                                                                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_assistido_crianca(p_assistido_id uuid, p_payload jsonb)                                                                                                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buscar_assistidos(p_text text, p_filter jsonb, p_orgao_id uuid, p_limit integer, p_offset integer)                                                                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buscar_assistidos_picker(p_text text, p_categoria public.assistido_categoria_enum, p_exclude uuid[], p_limit integer)                                                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cadastrar_assistido_adulto(p_payload jsonb)                                                                                                                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cadastrar_assistido_crianca(p_payload jsonb)                                                                                                                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cadastrar_processo(p_payload jsonb)                                                                                                                                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remover_foto_assistido(p_assistido_id uuid)                                                                                                                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vincular_foto_assistido(p_assistido_id uuid, p_foto_path text)                                                                                                                  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_workspace_column(p_workspace_id uuid, p_title text, p_description text, p_color_token text, p_custom_color text, p_filter jsonb)                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_workspace(p_orgao_id uuid, p_nome text, p_icone text)                                                                                                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_workspace_padrao(p_workspace_id uuid)                                                                                                                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_workspace_column(p_column_id uuid)                                                                                                                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.duplicar_workspace(p_workspace_id uuid, p_nome text)                                                                                                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.duplicate_workspace_column(p_column_id uuid)                                                                                                                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_default_workspace(p_orgao_id uuid)                                                                                                                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.excluir_workspace(p_workspace_id uuid)                                                                                                                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_workspace_column_assistidos(p_column_id uuid, p_limit integer, p_offset integer)                                                                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_workspace(p_orgao_id uuid, p_workspace_id uuid)                                                                                                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_workspaces_orgao(p_orgao_id uuid)                                                                                                                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renomear_workspace(p_workspace_id uuid, p_nome text)                                                                                                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reordenar_workspaces(p_orgao_id uuid, p_ordered_ids uuid[])                                                                                                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reorder_workspace_columns(p_workspace_id uuid, p_ordered_ids uuid[])                                                                                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_workspace_to_default(p_workspace_id uuid)                                                                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_workspace_column(p_column_id uuid, p_version integer, p_title text, p_description text, p_color_token text, p_custom_color text, p_filter jsonb)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_workspace_meta(p_workspace_id uuid, p_nome text, p_icone text)                                                                                                        FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS assistidos_fotos_select ON storage.objects;
DROP POLICY IF EXISTS assistidos_fotos_insert ON storage.objects;
DROP POLICY IF EXISTS assistidos_fotos_update ON storage.objects;
DROP POLICY IF EXISTS assistidos_fotos_delete ON storage.objects;

CREATE POLICY assistidos_fotos_gate1_deny
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'assistidos-fotos')
  WITH CHECK (bucket_id <> 'assistidos-fotos');

COMMENT ON TABLE public.assistidos             IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.assistido_familiares   IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.assistido_processos    IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.assistido_acolhimentos IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.assistido_providencias IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.assistido_vinculos     IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.processos              IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';
COMMENT ON TABLE public.processo_assistidos    IS 'QUARANTINED (Gate 1) - legacy domain, awaiting Gate 4 removal';