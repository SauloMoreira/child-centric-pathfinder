
-- =====================================================================
-- Gate 2 · Bloco 4 — RPCs de Área de Trabalho pessoal do Defensor
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: valida se o usuário atuante pode agir para um defensor+órgão
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.assert_can_act_for_defensor(
  p_defensor_user_id uuid,
  p_orgao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT private.user_can_act_for_defensor(auth.uid(), p_defensor_user_id, p_orgao_id) THEN
    RAISE EXCEPTION 'Sem permissão para atuar neste quadro' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_can_act_for_defensor(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- QUADROS
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.criar_workspace_defensor(
  p_defensor_user_id uuid,
  p_orgao_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_pos int;
BEGIN
  PERFORM private.assert_can_act_for_defensor(p_defensor_user_id, p_orgao_id);

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome do quadro é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1
    INTO v_pos
    FROM public.defensor_workspaces
   WHERE defensor_user_id = p_defensor_user_id
     AND orgao_id = p_orgao_id;

  INSERT INTO public.defensor_workspaces (defensor_user_id, orgao_id, nome, icone, order_position)
  VALUES (p_defensor_user_id, p_orgao_id, trim(p_nome), p_icone, v_pos)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_workspace_defensor(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_workspace_defensor(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.renomear_workspace_defensor(
  p_workspace_id uuid,
  p_nome text,
  p_icone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid;
  v_org uuid;
BEGIN
  SELECT defensor_user_id, orgao_id INTO v_def, v_org
    FROM public.defensor_workspaces WHERE id = p_workspace_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Quadro não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome do quadro é obrigatório' USING ERRCODE = '22023';
  END IF;

  UPDATE public.defensor_workspaces
     SET nome = trim(p_nome),
         icone = COALESCE(p_icone, icone),
         updated_at = now()
   WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.renomear_workspace_defensor(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renomear_workspace_defensor(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.excluir_workspace_defensor(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid;
  v_org uuid;
BEGIN
  SELECT defensor_user_id, orgao_id INTO v_def, v_org
    FROM public.defensor_workspaces WHERE id = p_workspace_id;
  IF v_def IS NULL THEN RETURN; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  DELETE FROM public.defensor_workspaces WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_workspace_defensor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_workspace_defensor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reordenar_workspaces_defensor(
  p_defensor_user_id uuid,
  p_orgao_id uuid,
  p_workspace_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_pos int := 0;
BEGIN
  PERFORM private.assert_can_act_for_defensor(p_defensor_user_id, p_orgao_id);

  FOREACH v_id IN ARRAY p_workspace_ids LOOP
    UPDATE public.defensor_workspaces
       SET order_position = v_pos, updated_at = now()
     WHERE id = v_id
       AND defensor_user_id = p_defensor_user_id
       AND orgao_id = p_orgao_id;
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_workspaces_defensor(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_workspaces_defensor(uuid, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- COLUNAS
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.criar_coluna_workspace(
  p_workspace_id uuid,
  p_nome text,
  p_cor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid; v_org uuid; v_id uuid; v_pos int;
BEGIN
  SELECT defensor_user_id, orgao_id INTO v_def, v_org
    FROM public.defensor_workspaces WHERE id = p_workspace_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Quadro não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome da coluna é obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspace_columns WHERE workspace_id = p_workspace_id;

  INSERT INTO public.defensor_workspace_columns (workspace_id, nome, cor, order_position)
  VALUES (p_workspace_id, trim(p_nome), p_cor, v_pos)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_coluna_workspace(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_coluna_workspace(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_coluna_workspace(
  p_column_id uuid,
  p_nome text,
  p_cor text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid; v_org uuid;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_columns c
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Coluna não encontrada' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome da coluna é obrigatório' USING ERRCODE = '22023';
  END IF;

  UPDATE public.defensor_workspace_columns
     SET nome = trim(p_nome), cor = COALESCE(p_cor, cor), updated_at = now()
   WHERE id = p_column_id;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_coluna_workspace(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_coluna_workspace(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.excluir_coluna_workspace(p_column_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_def uuid; v_org uuid;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_columns c
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF v_def IS NULL THEN RETURN; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);
  DELETE FROM public.defensor_workspace_columns WHERE id = p_column_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_coluna_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_coluna_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reordenar_colunas_workspace(
  p_workspace_id uuid,
  p_column_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid; v_org uuid; v_id uuid; v_pos int := 0;
BEGIN
  SELECT defensor_user_id, orgao_id INTO v_def, v_org
    FROM public.defensor_workspaces WHERE id = p_workspace_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Quadro não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  FOREACH v_id IN ARRAY p_column_ids LOOP
    UPDATE public.defensor_workspace_columns
       SET order_position = v_pos, updated_at = now()
     WHERE id = v_id AND workspace_id = p_workspace_id;
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_colunas_workspace(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_colunas_workspace(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- CARTÕES (referenciam content_items — sem PII)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adicionar_card_workspace(
  p_column_id uuid,
  p_item_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid; v_org uuid; v_id uuid; v_pos int;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_columns c
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_column_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Coluna não encontrada' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  IF NOT EXISTS (SELECT 1 FROM public.content_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'Item da biblioteca não encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(max(order_position), -1) + 1 INTO v_pos
    FROM public.defensor_workspace_cards WHERE column_id = p_column_id;

  INSERT INTO public.defensor_workspace_cards (column_id, item_id, note, order_position)
  VALUES (p_column_id, p_item_id, p_note, v_pos)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adicionar_card_workspace(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adicionar_card_workspace(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_card_workspace(
  p_card_id uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_def uuid; v_org uuid;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_cards k
    JOIN public.defensor_workspace_columns c ON c.id = k.column_id
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE k.id = p_card_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Cartão não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  UPDATE public.defensor_workspace_cards
     SET note = p_note, updated_at = now()
   WHERE id = p_card_id;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_card_workspace(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_card_workspace(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remover_card_workspace(p_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_def uuid; v_org uuid;
BEGIN
  SELECT w.defensor_user_id, w.orgao_id INTO v_def, v_org
    FROM public.defensor_workspace_cards k
    JOIN public.defensor_workspace_columns c ON c.id = k.column_id
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE k.id = p_card_id;
  IF v_def IS NULL THEN RETURN; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);
  DELETE FROM public.defensor_workspace_cards WHERE id = p_card_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remover_card_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remover_card_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mover_card_workspace(
  p_card_id uuid,
  p_target_column_id uuid,
  p_new_position int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_def uuid; v_org uuid; v_src_col uuid;
  v_tgt_def uuid; v_tgt_org uuid;
BEGIN
  -- valida origem
  SELECT w.defensor_user_id, w.orgao_id, k.column_id INTO v_def, v_org, v_src_col
    FROM public.defensor_workspace_cards k
    JOIN public.defensor_workspace_columns c ON c.id = k.column_id
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE k.id = p_card_id;
  IF v_def IS NULL THEN RAISE EXCEPTION 'Cartão não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_can_act_for_defensor(v_def, v_org);

  -- valida destino (deve ser do mesmo defensor+órgão)
  SELECT w.defensor_user_id, w.orgao_id INTO v_tgt_def, v_tgt_org
    FROM public.defensor_workspace_columns c
    JOIN public.defensor_workspaces w ON w.id = c.workspace_id
   WHERE c.id = p_target_column_id;
  IF v_tgt_def IS NULL THEN RAISE EXCEPTION 'Coluna destino não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_tgt_def <> v_def OR v_tgt_org <> v_org THEN
    RAISE EXCEPTION 'Cartão só pode ser movido dentro do mesmo defensor/órgão' USING ERRCODE = '42501';
  END IF;

  -- abre espaço no destino
  UPDATE public.defensor_workspace_cards
     SET order_position = order_position + 1, updated_at = now()
   WHERE column_id = p_target_column_id AND order_position >= p_new_position;

  UPDATE public.defensor_workspace_cards
     SET column_id = p_target_column_id,
         order_position = p_new_position,
         updated_at = now()
   WHERE id = p_card_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mover_card_workspace(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mover_card_workspace(uuid, uuid, int) TO authenticated;
