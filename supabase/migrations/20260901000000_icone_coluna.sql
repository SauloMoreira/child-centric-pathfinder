-- Ajuste doc (novo AJUSTE 1) — "Ícones na área de trabalho":
-- 1) Removida a personalização de ícone por PAINEL (mudança só de
--    frontend — todos os botões de painel passam a usar o mesmo ícone).
-- 2) Adicionada a possibilidade de ícone por COLUNA: ao editar a coluna,
--    o usuário escolhe um ícone entre uma paleta curada, sem vínculo real
--    com categorias (a paleta só cresce em tamanho conforme mais
--    categorias existem no sistema — puramente visual, sem associação).

ALTER TABLE public.defensor_workspace_columns
  ADD COLUMN IF NOT EXISTS icone text NULL;

-- Allowlist do backend — mesma lista de chaves que o frontend usa para
-- resolver o componente de ícone (ver src/features/work-area/components/
-- column-icon.tsx). Mantida como CHECK simples (não FK) para não acoplar
-- o backend a uma tabela de ícones que não existe de fato.
ALTER TABLE public.defensor_workspace_columns
  ADD CONSTRAINT defensor_workspace_columns_icone_ck
  CHECK (icone IS NULL OR icone IN (
    'layers','folder','briefcase','book','gavel','scale','users','user',
    'clipboard','flag','star','bookmark','target','shield','inbox','archive',
    'file-text','heart','home','lightbulb','map-pin','message-square',
    'calendar','graduation-cap','landmark','life-buoy','puzzle','handshake'
  ));

-- ---------------------------------------------------------------------------
-- criar_coluna_workspace — novo parâmetro opcional p_icone.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text
);

CREATE FUNCTION public.criar_coluna_workspace(
  p_workspace_id                uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid,
  p_nome                        text,
  p_descricao                   text DEFAULT NULL,
  p_cor_token                   public.workspace_color_enum DEFAULT 'neutral',
  p_cor_custom                  text DEFAULT NULL,
  p_icone                       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_acc record; v_new bigint; v_id uuid; v_pos int;
  v_replay jsonb;
BEGIN
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, p_workspace_id);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.create',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay->'result'; END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023';
  END IF;
  IF p_cor_custom IS NOT NULL AND p_cor_custom !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOR' USING ERRCODE='22023';
  END IF;

  v_new := private.bump_workspace_version(p_workspace_id, p_expected_workspace_version);

  SELECT COALESCE(max(order_position),-1)+1 INTO v_pos
    FROM public.defensor_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO public.defensor_workspace_columns
    (workspace_id, nome, descricao, cor_token, cor, order_position, icone)
  VALUES (p_workspace_id, trim(p_nome), nullif(trim(coalesce(p_descricao,'')),''),
          p_cor_token, p_cor_custom, v_pos, p_icone)
  RETURNING id INTO v_id;

  PERFORM private.log_audit_event('workspace.column_created','defensor_workspace_column',
    v_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', p_workspace_id),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.create',p_idempotency_key,
    jsonb_build_object('column_id', v_id, 'workspace_version', v_new));
  RETURN jsonb_build_object('column_id', v_id, 'workspace_version', v_new);
END $fn$;

REVOKE ALL ON FUNCTION public.criar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- atualizar_coluna_workspace — novo parâmetro opcional p_icone.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.atualizar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text
);

CREATE FUNCTION public.atualizar_coluna_workspace(
  p_column_id                   uuid,
  p_expected_workspace_version  bigint,
  p_idempotency_key             uuid,
  p_nome                        text,
  p_descricao                   text DEFAULT NULL,
  p_cor_token                   public.workspace_color_enum DEFAULT 'neutral',
  p_cor_custom                  text DEFAULT NULL,
  p_icone                       text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid(); v_ws uuid; v_acc record; v_new bigint; v_replay jsonb;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.defensor_workspace_columns WHERE id = p_column_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_acc FROM private.user_workspace_access(v_actor, v_ws);
  IF NOT v_acc.can_manage_columns THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_replay := private.claim_idempotency(v_actor,'workspace.column.update',p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN (v_replay->'result'->>'workspace_version')::bigint; END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE='22023'; END IF;
  IF p_cor_custom IS NOT NULL AND p_cor_custom !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOR' USING ERRCODE='22023';
  END IF;

  v_new := private.bump_workspace_version(v_ws, p_expected_workspace_version);

  UPDATE public.defensor_workspace_columns
     SET nome = trim(p_nome),
         descricao = nullif(trim(coalesce(p_descricao,'')),''),
         cor_token = p_cor_token,
         cor = p_cor_custom,
         icone = p_icone,
         updated_at = now()
   WHERE id = p_column_id;

  PERFORM private.log_audit_event('workspace.column_updated','defensor_workspace_column',
    p_column_id::text,'sucesso'::public.audit_result,NULL,
    jsonb_build_object('workspace_id', v_ws),NULL,NULL,NULL);
  PERFORM private.complete_idempotency(v_actor,'workspace.column.update',p_idempotency_key,
    jsonb_build_object('workspace_version', v_new));
  RETURN v_new;
END $fn$;

REVOKE ALL ON FUNCTION public.atualizar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_coluna_workspace(
  uuid, bigint, uuid, text, text, public.workspace_color_enum, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- listar_workspace_completo — inclui 'icone' no jsonb de cada coluna.
-- ---------------------------------------------------------------------------
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
      'orderPosition', c.order_position,
      'icone', c.icone
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
  ) ORDER BY r.order_position), '[]'::jsonb)
    INTO v_cards
    FROM raw r;

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
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_workspace_completo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_workspace_completo(uuid) TO authenticated;
