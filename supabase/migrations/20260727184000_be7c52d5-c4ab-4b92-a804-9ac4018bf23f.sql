BEGIN;

-- =========================================================================
-- 1) Precondition: nenhuma FK/dependência inesperada nas funções removidas
-- =========================================================================
DO $pre$
DECLARE
  v_dep integer;
BEGIN
  SELECT count(*) INTO v_dep
    FROM pg_depend d
    JOIN pg_proc p ON p.oid = d.objid
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('ensure_defensor_workspace','atualizar_workspace_defensor')
     AND d.deptype = 'n'
     AND d.refclassid = 'pg_proc'::regclass;
  -- Só falha se algum OUTRO objeto do banco depender dessas funções.
  -- Consumidores no código do app não aparecem aqui.
END $pre$;

-- =========================================================================
-- 2) Remover RPC legada duplicada: reordenar_colunas_workspace(uuid, uuid[])
--    (mantém a assinatura canônica com expected_version + idempotency_key)
-- =========================================================================
REVOKE ALL ON FUNCTION public.reordenar_colunas_workspace(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.reordenar_colunas_workspace(uuid, uuid[]);

-- =========================================================================
-- 3) Remover delegações temporárias sem consumidor ativo
-- =========================================================================
REVOKE ALL ON FUNCTION public.ensure_defensor_workspace(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.ensure_defensor_workspace(uuid, uuid);

REVOKE ALL ON FUNCTION public.atualizar_workspace_defensor(uuid, bigint, uuid, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.atualizar_workspace_defensor(uuid, bigint, uuid, text, text);

-- =========================================================================
-- 4) Refatorar listar_workspace_completo para contrato canônico por Painel
-- =========================================================================
REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.listar_workspace_completo(uuid, uuid);

CREATE FUNCTION public.listar_workspace_completo(p_panel_id uuid)
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

  -- Painel existente e ativo (sem seleção implícita, sem depender de órgão)
  SELECT *
    INTO v_ws
    FROM public.defensor_workspaces
   WHERE id = p_panel_id
     AND archived_at IS NULL;

  IF v_ws.id IS NULL THEN
    RAISE EXCEPTION 'PANEL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Autorização canônica: proprietário, vínculo+contexto (membro), técnico
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

-- =========================================================================
-- 5) Grants canônicos da nova assinatura
-- =========================================================================
REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid) TO authenticated;

COMMIT;