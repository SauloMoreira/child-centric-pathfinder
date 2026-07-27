DROP FUNCTION IF EXISTS public.listar_workspace_completo(uuid);

CREATE OR REPLACE FUNCTION public.listar_workspace_completo(
  p_defensor_user_id uuid,
  p_panel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_ws_id uuid;
  v_ws record;
  v_acc record;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF p_panel_id IS NOT NULL THEN
    SELECT * INTO v_ws
      FROM public.defensor_workspaces
     WHERE id = p_panel_id
       AND defensor_user_id = p_defensor_user_id
       AND archived_at IS NULL;
  ELSE
    SELECT * INTO v_ws
      FROM public.defensor_workspaces
     WHERE defensor_user_id = p_defensor_user_id AND archived_at IS NULL
     ORDER BY order_position, created_at
     LIMIT 1;
  END IF;

  IF v_ws.id IS NULL THEN
    RETURN jsonb_build_object('workspace', NULL, 'access',
      jsonb_build_object('accessMode','none','canEditWorkspace',false,
        'canManageColumns',false,'canMoveCards',false,'canAddItems',false));
  END IF;
  v_ws_id := v_ws.id;

  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws_id);
  IF NOT v_acc.can_view THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
    'corToken', c.cor_token, 'corCustom', c.cor,
    'orderPosition', c.order_position
  ) ORDER BY c.order_position), '[]'::jsonb) INTO v_columns
    FROM public.defensor_workspace_columns c WHERE c.workspace_id = v_ws_id;

  WITH raw AS (
    SELECT k.id, k.column_id, k.item_id, k.order_position, k.updated_at,
           i.kind, i.owner_user_id, i.status,
           v.title, v.version_number,
           pv.title AS pub_title, pv.version_number AS pub_version,
           cat.nome AS categoria,
           pr.nome_completo AS owner_name
      FROM public.defensor_workspace_cards k
      JOIN public.content_items i ON i.id = k.item_id
      LEFT JOIN public.content_versions v ON v.id = i.current_version_id
      LEFT JOIN public.content_versions pv ON pv.id = i.current_published_version_id
      LEFT JOIN public.content_categories cat ON cat.id = i.category_id
      LEFT JOIN public.profiles pr ON pr.user_id = i.owner_user_id
     WHERE k.workspace_id = v_ws_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cardId',       r.id,
    'workspaceId',  v_ws_id,
    'columnId',     r.column_id,
    'itemId',       r.item_id,
    'kind',         r.kind,
    'placement',    CASE WHEN r.owner_user_id = v_acc.defensor_user_id THEN 'owned' ELSE 'imported' END,
    'title',        COALESCE(r.pub_title, r.title, '(sem título)'),
    'description',  NULL,
    'categoryNames', CASE WHEN r.categoria IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(r.categoria) END,
    'ownerDisplayName', COALESCE(r.owner_name, ''),
    'status',       r.status,
    'publishedVersionNumber', r.pub_version,
    'updatedAt',    r.updated_at,
    'archivedByAuthor', (r.status = 'arquivado'),
    'orderPosition', r.order_position,
    'canOpen', (
      (v_acc.access_mode = 'owner')
      OR (r.status = 'publicado')
      OR (r.status = 'arquivado' AND r.pub_version IS NOT NULL)
    ),
    'canEdit', (v_acc.access_mode = 'owner' AND r.owner_user_id = v_acc.defensor_user_id),
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

REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid, uuid) TO authenticated;

-- Também não precisamos mais da versão redundante criada na migration anterior.
DROP FUNCTION IF EXISTS public.listar_painel_completo(uuid);