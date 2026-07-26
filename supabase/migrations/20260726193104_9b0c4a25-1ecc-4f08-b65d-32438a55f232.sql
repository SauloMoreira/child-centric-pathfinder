
-- Path esperado: <orgao_id>/<assistido_id>/<uuid>.<ext>
-- storage.objects.name contém o path completo

CREATE POLICY "assistidos_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND a.orgao_execucao_id::text = split_part(name, '/', 1)
         AND a.deleted_at IS NULL
         AND (
           private.is_admin_tecnico()
           OR private.current_user_is_admin()
           OR a.orgao_execucao_id = private.current_active_org_id()
         )
    )
  );

CREATE POLICY "assistidos_fotos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assistidos-fotos'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND a.orgao_execucao_id::text = split_part(name, '/', 1)
         AND a.deleted_at IS NULL
         AND (
           private.is_admin_tecnico()
           OR private.current_user_is_admin()
           OR a.orgao_execucao_id = private.current_active_org_id()
         )
    )
  );

CREATE POLICY "assistidos_fotos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND a.deleted_at IS NULL
         AND (
           private.is_admin_tecnico()
           OR private.current_user_is_admin()
           OR a.orgao_execucao_id = private.current_active_org_id()
         )
    )
  );

CREATE POLICY "assistidos_fotos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assistidos-fotos'
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id::text = split_part(name, '/', 2)
         AND (
           private.is_admin_tecnico()
           OR private.current_user_is_admin()
           OR a.orgao_execucao_id = private.current_active_org_id()
         )
    )
  );
