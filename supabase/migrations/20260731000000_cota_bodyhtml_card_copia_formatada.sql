-- Ajuste (Área de Trabalho / Cota): o card de visualização rápida da cota
-- passa a expor também o HTML formatado (negrito/itálico/sublinhado) além
-- do texto puro, para que o botão "copiar" do card copie o texto já com a
-- formatação aplicada (mesmo comportamento buscado na camada lateral de
-- detalhe, que já tinha acesso a bodyJson).

CREATE OR REPLACE FUNCTION public.listar_workspace_completo(p_panel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_ws record;
  v_acc record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_panel_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_ws
    FROM public.defensor_workspaces
   WHERE id = p_panel_id
     AND archived_at IS NULL;

  IF v_ws.id IS NULL THEN
    RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws.id);
  IF NOT v_acc.can_view THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'descricao', c.descricao,
      'corToken', c.cor_token,
      'corCustom', c.cor,
      'orderPosition', c.order_position
    ) ORDER BY c.order_position), '[]'::jsonb)
    INTO v_columns
    FROM public.defensor_workspace_columns c
   WHERE c.workspace_id = v_ws.id;

  WITH raw AS (
    SELECT k.id, k.column_id, k.item_id, k.order_position, k.updated_at,
           i.kind, i.owner_user_id, i.status,
           v.title, v.version_number, v.body_text, v.body_json,
           pv.title AS pub_title, pv.version_number AS pub_version,
           pr.nome_completo AS owner_name,
           COALESCE((
             SELECT jsonb_agg(cc.nome ORDER BY cc.order_position)
               FROM public.content_item_categories cic
               JOIN public.content_categories cc ON cc.id = cic.category_id
              WHERE cic.item_id = i.id
           ), '[]'::jsonb) AS categorias
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id AND i.deleted_at IS NULL
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_versions pv ON pv.id = i.current_published_version_id
      LEFT JOIN public.profiles pr ON pr.user_id = i.owner_user_id
     WHERE k.workspace_id = v_ws.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cardId',       r.id,
    'workspaceId',  v_ws.id,
    'columnId',     r.column_id,
    'itemId',       r.item_id,
    'kind',         r.kind,
    'placement',    CASE WHEN r.owner_user_id = v_acc.defensor_user_id THEN 'owned' ELSE 'imported' END,
    'title',        COALESCE(r.pub_title, r.title, '(sem título)'),
    'description',  NULL,
    'categoryNames', r.categorias,
    'ownerDisplayName', COALESCE(r.owner_name, ''),
    'status',       r.status,
    'publishedVersionNumber', r.pub_version,
    'updatedAt',    r.updated_at,
    'archivedByAuthor', (r.status = 'arquivado'),
    'orderPosition', r.order_position,
    'bodyText', CASE WHEN r.kind = 'cota' THEN r.body_text ELSE NULL END,
    'bodyHtml', CASE WHEN r.kind = 'cota' THEN (r.body_json->>'html') ELSE NULL END,
    'canOpen', (
      (v_acc.access_mode = 'owner')
      OR (r.status = 'publicado')
      OR (r.status = 'arquivado' AND r.pub_version IS NOT NULL)
    ),
    'canEdit', (r.owner_user_id = v_actor),
    'canUse',  (
      (r.status = 'publicado')
      OR (v_acc.access_mode = 'owner' AND r.status <> 'arquivado')
    )
  ) ORDER BY r.order_position), '[]'::jsonb) INTO v_cards FROM raw r;

  RETURN jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id,
      'defensorUserId', v_ws.defensor_user_id,
      'nome', v_ws.nome,
      'icone', v_ws.icone,
      'optimisticVersion', v_ws.optimistic_version,
      'updatedAt', v_ws.updated_at
    ),
    'access', jsonb_build_object(
      'accessMode', v_acc.access_mode,
      'canEditWorkspace', v_acc.can_edit_workspace,
      'canManageColumns', v_acc.can_manage_columns,
      'canMoveCards', v_acc.can_move_cards,
      'canAddItems', v_acc.can_add_items
    ),
    'columns', v_columns,
    'cards', v_cards
  );
END $function$;

REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid) TO authenticated;
