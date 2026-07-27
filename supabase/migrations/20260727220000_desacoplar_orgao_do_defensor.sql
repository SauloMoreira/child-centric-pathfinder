-- ============================================================================
-- Ágora — Desacopla vínculos e contexto do "órgão de execução"
-- ============================================================================
--
-- CAUSA RAIZ
-- O eixo do sistema passou a ser o Defensor Público, mas duas colunas
-- continuaram obrigatórias:
--   public.defensor_context.orgao_id       NOT NULL
--   public.member_defensor_bonds.orgao_id  NOT NULL
--
-- Defensores não possuem linha em private.user_operational_context, então as
-- funções abaixo precisavam "descobrir" um órgão para conseguir gravar, e
-- falhavam quando não achavam nenhum:
--
--   selecionar_contexto_defensor -> INVALID_DEFENDER_CONTEXT
--     (Técnico não consegue selecionar Defensor)
--   vincular_membro_defensor     -> DEFENDER_HAS_NO_ORG
--     (Defensor não consegue vincular membro à equipe)
--   user_can_act_for_defensor    -> exigia igualdade de órgão no vínculo
--
-- ESTA MIGRATION
-- Torna orgao_id opcional e remove a resolução de órgão dessas funções.
-- Nada é destruído: colunas e tabelas de órgão permanecem no schema, apenas
-- deixam de participar da autorização. A remoção definitiva fica para uma
-- fase posterior, sem risco para os dados existentes.
--
-- Idempotente: pode ser aplicada mais de uma vez com segurança.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. orgao_id deixa de ser obrigatório
-- ---------------------------------------------------------------------------
ALTER TABLE public.defensor_context      ALTER COLUMN orgao_id DROP NOT NULL;
ALTER TABLE public.member_defensor_bonds ALTER COLUMN orgao_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Autorização por vínculo, sem órgão
--    A assinatura é preservada para não quebrar chamadores existentes;
--    o parâmetro _orgao passa a ser ignorado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.user_can_act_for_defensor(
  _caller uuid,
  _defensor uuid,
  _orgao uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _caller = _defensor
    OR EXISTS (
      SELECT 1 FROM public.member_defensor_bonds b
       WHERE b.member_user_id   = _caller
         AND b.defensor_user_id = _defensor
         AND b.status           = 'ativo'::public.member_defensor_bond_status
         AND b.ended_at IS NULL
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Seleção de contexto do Defensor, sem órgão
--    Ordem de autorização preservada: owner -> admin_tecnico -> membro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.selecionar_contexto_defensor(
  p_defensor_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_claim jsonb;
  v_result jsonb;
  v_mode text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;
  IF p_defensor_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_DEFENDER_CONTEXT' USING ERRCODE='22023';
  END IF;
  IF NOT private.user_is_active_defensor(p_defensor_user_id) THEN
    RAISE EXCEPTION 'DEFENDER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  v_claim := private.claim_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  IF p_defensor_user_id = v_uid AND private.user_is_active_defensor(v_uid) THEN
    v_mode := 'owner';
  ELSIF private.tem_papel(v_uid,'admin_tecnico') THEN
    v_mode := 'technical_admin';
  ELSIF private.user_is_active_team_member(v_uid)
    AND private.active_member_defensor_bond_exists(v_uid, p_defensor_user_id) THEN
    v_mode := 'team';
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.defensor_context (user_id, defensor_user_id)
  VALUES (v_uid, p_defensor_user_id)
  ON CONFLICT (user_id) DO UPDATE
     SET defensor_user_id = EXCLUDED.defensor_user_id,
         updated_at       = now();

  PERFORM private.log_audit_event(
    CASE WHEN v_mode='technical_admin'
         THEN 'admin.technical_defender_context_selected'
         ELSE 'user.defender_context_selected' END,
    'defensor_context', v_uid::text,
    'sucesso', NULL,
    jsonb_build_object('defensor_user_id', p_defensor_user_id, 'mode', v_mode),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'DEFENDER_CONTEXT_SELECTED',
    'defenderUserId', p_defensor_user_id,
    'mode', v_mode,
    'accessMode', v_mode
  );

  PERFORM private.complete_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key, v_result);
  RETURN v_result;
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Vínculo Membro -> Defensor, sem órgão
--    Um membro pode se vincular a mais de um Defensor: o índice único
--    uq_active_member_defensor_bond já cobre (member_user_id, defensor_user_id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_membro_defensor(
  p_member_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_replay jsonb;
  v_result jsonb;
  v_bond_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active(v_uid) THEN
    RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501';
  END IF;
  IF NOT private.user_is_active_defensor(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id = v_uid THEN
    RAISE EXCEPTION 'INVALID_MEMBER' USING ERRCODE='22023';
  END IF;

  v_replay := private.claim_idempotency(v_uid, 'team.defender_link_created', p_idempotency_key);
  IF v_replay IS NOT NULL AND (v_replay->>'replay')::boolean THEN
    RETURN v_replay->'result';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.user_id = p_member_user_id
       AND pr.status = 'ativo'::public.profile_status
       AND pr.ativo = true
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT private.user_is_active_team_member(p_member_user_id) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.user_roles ur
     WHERE ur.user_id = p_member_user_id
       AND ur.revoked_at IS NULL
       AND ur.role IN (
         'admin_tecnico'::public.app_role,
         'admin_institucional'::public.app_role,
         'defensor_publico'::public.app_role
       )
  ) THEN
    RAISE EXCEPTION 'MEMBER_INCOMPATIBLE_ROLE' USING ERRCODE='42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_defensor_bonds b
     WHERE b.member_user_id = p_member_user_id
       AND b.defensor_user_id = v_uid
       AND b.status = 'ativo'::public.member_defensor_bond_status
       AND b.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.member_defensor_bonds
    (member_user_id, defensor_user_id, status, created_by)
  VALUES
    (p_member_user_id, v_uid, 'ativo'::public.member_defensor_bond_status, v_uid)
  RETURNING id INTO v_bond_id;

  PERFORM private.log_audit_event(
    'team.defender_link_created', 'member_defensor_bond', v_bond_id::text,
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'member_user_id', p_member_user_id,
      'defensor_user_id', v_uid
    ),
    NULL, gen_random_uuid(), NULL);

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'MEMBERSHIP_CREATED',
    'bondId', v_bond_id,
    'optimisticVersion', 1
  );
  PERFORM private.complete_idempotency(v_uid, 'team.defender_link_created', p_idempotency_key, v_result);
  RETURN v_result;
END $function$;

-- ---------------------------------------------------------------------------
-- 5. Permissões (reafirmadas após CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.selecionar_contexto_defensor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.selecionar_contexto_defensor(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.vincular_membro_defensor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_membro_defensor(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.user_can_act_for_defensor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.defensor_context.orgao_id IS
  'LEGADO: nao participa mais da autorizacao. Remocao prevista para fase posterior.';
COMMENT ON COLUMN public.member_defensor_bonds.orgao_id IS
  'LEGADO: nao participa mais da autorizacao. Remocao prevista para fase posterior.';

COMMIT;
