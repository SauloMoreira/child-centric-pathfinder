-- ============================================================
-- PART 3/3: RLS revised — operational tables respect user_can_access_org
--          AND current_operational_org_id
-- ============================================================

-- Assistidos
DROP POLICY IF EXISTS assistidos_select ON public.assistidos;
CREATE POLICY assistidos_select ON public.assistidos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND private.user_can_access_org(orgao_execucao_id)
    AND orgao_execucao_id = private.current_operational_org_id()
  );

-- Processos
DROP POLICY IF EXISTS processos_select ON public.processos;
CREATE POLICY processos_select ON public.processos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND private.user_can_access_org(orgao_execucao_id)
    AND orgao_execucao_id = private.current_operational_org_id()
  );

-- processo_assistidos (via processo)
DROP POLICY IF EXISTS procass_select ON public.processo_assistidos;
CREATE POLICY procass_select ON public.processo_assistidos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.processos p
     WHERE p.id = processo_assistidos.processo_id
       AND p.deleted_at IS NULL
       AND private.user_can_access_org(p.orgao_execucao_id)
       AND p.orgao_execucao_id = private.current_operational_org_id()
  ));

-- Storage: fotos de assistidos
DROP POLICY IF EXISTS assistidos_fotos_select ON storage.objects;
CREATE POLICY assistidos_fotos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND a.orgao_execucao_id::text = split_part(name, '/', 1)
         AND a.deleted_at IS NULL
         AND private.user_can_access_org(a.orgao_execucao_id)
         AND a.orgao_execucao_id = private.current_operational_org_id()
    )
  );

DROP POLICY IF EXISTS assistidos_fotos_update ON storage.objects;
CREATE POLICY assistidos_fotos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND a.deleted_at IS NULL
         AND private.user_can_access_org(a.orgao_execucao_id)
         AND a.orgao_execucao_id = private.current_operational_org_id()
    )
  );

DROP POLICY IF EXISTS assistidos_fotos_delete ON storage.objects;
CREATE POLICY assistidos_fotos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND private.user_can_access_org(a.orgao_execucao_id)
         AND a.orgao_execucao_id = private.current_operational_org_id()
    )
  );
