-- =====================================================================
-- Sub-gate 4.1.b · Turno 2 — member_defensor_bond_integrity
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 0) Preflight defensivo (aborta em qualquer inconsistência crítica)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_autos int; v_dup int; v_ativos_ended int; v_enc_sem_ended int;
BEGIN
  SELECT count(*) INTO v_autos FROM public.member_defensor_bonds WHERE member_user_id=defensor_user_id;
  SELECT count(*) INTO v_ativos_ended FROM public.member_defensor_bonds WHERE status='ativo' AND ended_at IS NOT NULL;
  SELECT count(*) INTO v_enc_sem_ended FROM public.member_defensor_bonds WHERE status='encerrado' AND ended_at IS NULL;
  SELECT count(*) INTO v_dup FROM (
    SELECT 1 FROM public.member_defensor_bonds WHERE status='ativo'
     GROUP BY member_user_id, defensor_user_id HAVING count(*) > 1
  ) x;
  IF v_autos>0 OR v_ativos_ended>0 OR v_enc_sem_ended>0 OR v_dup>0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED autovinculos=% dup=% ativos_ended=% enc_sem_ended=%',
      v_autos, v_dup, v_ativos_ended, v_enc_sem_ended;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Grants explícitos: nenhuma escrita direta por authenticated/anon
-- ---------------------------------------------------------------------
REVOKE ALL ON public.member_defensor_bonds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.defensor_context      FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.member_defensor_bonds TO authenticated;
GRANT SELECT ON public.defensor_context      TO authenticated;
GRANT ALL ON public.member_defensor_bonds    TO service_role;
GRANT ALL ON public.defensor_context         TO service_role;

-- ---------------------------------------------------------------------
-- 2) Colunas novas
-- ---------------------------------------------------------------------
ALTER TABLE public.member_defensor_bonds
  ADD COLUMN IF NOT EXISTS optimistic_version bigint NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------
-- 3) Trigger de coerência estado ↔ encerramento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_member_defensor_bond_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.member_user_id = NEW.defensor_user_id THEN
    RAISE EXCEPTION 'SELF_MEMBERSHIP_NOT_ALLOWED' USING ERRCODE='23514';
  END IF;
  IF NEW.status = 'ativo' AND NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_STATE_INCONSISTENT' USING ERRCODE='23514';
  END IF;
  IF NEW.status = 'encerrado' AND NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_STATE_INCONSISTENT' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS member_defensor_bond_state ON public.member_defensor_bonds;
CREATE TRIGGER member_defensor_bond_state
  BEFORE INSERT OR UPDATE OF status, ended_at, member_user_id, defensor_user_id
  ON public.member_defensor_bonds
  FOR EACH ROW EXECUTE FUNCTION public.tg_member_defensor_bond_state();

-- ---------------------------------------------------------------------
-- 4) Índice único parcial correto (member+defensor, ignora orgão)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.member_defensor_bonds_active_uk;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_member_defensor_bond
  ON public.member_defensor_bonds (member_user_id, defensor_user_id)
  WHERE status = 'ativo' AND ended_at IS NULL;

-- ---------------------------------------------------------------------
-- 5) Helpers privados
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.user_is_active_team_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
      JOIN private.user_roles ur ON ur.user_id = pr.user_id
     WHERE pr.user_id = p_user_id
       AND pr.status = 'ativo'
       AND pr.ativo  = true
       AND ur.role   = 'membro_equipe'
       AND ur.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.user_is_active_defensor(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
      JOIN private.user_roles ur ON ur.user_id = pr.user_id
     WHERE pr.user_id = p_user_id
       AND pr.status = 'ativo'
       AND pr.ativo  = true
       AND ur.role   = 'defensor_publico'
       AND ur.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.active_member_defensor_bond_exists(
  p_member uuid, p_defensor uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_defensor_bonds
     WHERE member_user_id = p_member
       AND defensor_user_id = p_defensor
       AND status = 'ativo'
       AND ended_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.user_is_active_team_member(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.user_is_active_defensor(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.active_member_defensor_bond_exists(uuid, uuid)  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC — encerrar vínculo membro↔Defensor (transacional + contexto)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encerrar_member_defensor_bond(
  p_bond_id          uuid,
  p_expected_version bigint,
  p_reason           text,
  p_idempotency_key  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_row    public.member_defensor_bonds%ROWTYPE;
  v_claim  jsonb;
  v_result jsonb;
  v_authorized boolean := false;
  v_remaining int;
  v_only_defensor uuid;
  v_context_changed boolean := false;
  v_new_context uuid := NULL;
  v_selection_required boolean := false;
  v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_is_active(v_uid) THEN RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 240 THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE='22023';
  END IF;

  v_claim := private.claim_idempotency(v_uid, 'team.defender_link_ended', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  SELECT * INTO v_row FROM public.member_defensor_bonds
   WHERE id = p_bond_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  -- Autorização: Defensor dono, Admin Institucional/Técnico
  IF v_row.defensor_user_id = v_uid THEN v_authorized := true; END IF;
  IF NOT v_authorized AND (private.tem_papel(v_uid,'admin_institucional') OR private.tem_papel(v_uid,'admin_tecnico')) THEN
    v_authorized := true;
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF v_row.status = 'encerrado' THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ENDED' USING ERRCODE='22023';
  END IF;
  IF v_row.optimistic_version <> p_expected_version THEN
    RAISE EXCEPTION 'CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;

  UPDATE public.member_defensor_bonds
     SET status = 'encerrado',
         ended_at = now(),
         ended_by = v_uid,
         optimistic_version = optimistic_version + 1,
         updated_at = now()
   WHERE id = p_bond_id;

  -- Corrige contexto do membro se aponta para este Defensor
  IF EXISTS (
    SELECT 1 FROM public.defensor_context
     WHERE user_id = v_row.member_user_id
       AND defensor_user_id = v_row.defensor_user_id
  ) THEN
    SELECT count(*), max(defensor_user_id) FILTER (WHERE true)
      INTO v_remaining, v_only_defensor
      FROM public.member_defensor_bonds
     WHERE member_user_id = v_row.member_user_id
       AND status='ativo' AND ended_at IS NULL;

    IF v_remaining = 0 THEN
      DELETE FROM public.defensor_context WHERE user_id = v_row.member_user_id;
      v_context_changed := true; v_new_context := NULL;
    ELSIF v_remaining = 1 THEN
      UPDATE public.defensor_context
         SET defensor_user_id = v_only_defensor, updated_at = now()
       WHERE user_id = v_row.member_user_id;
      v_context_changed := true; v_new_context := v_only_defensor;
    ELSE
      DELETE FROM public.defensor_context WHERE user_id = v_row.member_user_id;
      v_context_changed := true; v_new_context := NULL; v_selection_required := true;
    END IF;
  END IF;

  PERFORM private.log_audit_event(
    'team.defender_link_ended','member_defensor_bond', p_bond_id::text,
    'sucesso', NULL,
    jsonb_build_object(
      'member_user_id', v_row.member_user_id,
      'defensor_user_id', v_row.defensor_user_id,
      'origin_org_id', v_row.orgao_id,
      'context_changed', v_context_changed,
      'selection_required', v_selection_required
    ),
    NULL, gen_random_uuid(), NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'MEMBERSHIP_ENDED',
    'bondId', p_bond_id,
    'optimisticVersion', v_row.optimistic_version + 1,
    'contextChanged', v_context_changed,
    'newContext', v_new_context,
    'selectionRequired', v_selection_required
  );

  PERFORM private.complete_idempotency(v_uid, 'team.defender_link_ended', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

-- ---------------------------------------------------------------------
-- 7) RPC — selecionar contexto Defensor (para membro / técnico)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.selecionar_contexto_defensor(
  p_defensor_user_id uuid,
  p_idempotency_key  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_claim jsonb;
  v_result jsonb;
  v_mode text;
  v_bond_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT private.user_is_active(v_uid) THEN RAISE EXCEPTION 'PROFILE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF p_defensor_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_DEFENDER_CONTEXT' USING ERRCODE='22023'; END IF;
  IF NOT private.user_is_active_defensor(p_defensor_user_id) THEN
    RAISE EXCEPTION 'DEFENDER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  v_claim := private.claim_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key);
  IF v_claim IS NOT NULL AND (v_claim->>'replay')::boolean THEN
    RETURN v_claim->'result';
  END IF;

  -- Modo por papel
  IF p_defensor_user_id = v_uid AND private.user_is_active_defensor(v_uid) THEN
    v_mode := 'owner';
  ELSIF private.user_is_active_team_member(v_uid)
    AND private.active_member_defensor_bond_exists(v_uid, p_defensor_user_id) THEN
    v_mode := 'team';
    SELECT orgao_id INTO v_bond_org FROM public.member_defensor_bonds
      WHERE member_user_id=v_uid AND defensor_user_id=p_defensor_user_id
        AND status='ativo' AND ended_at IS NULL LIMIT 1;
  ELSIF private.tem_papel(v_uid,'admin_tecnico') THEN
    v_mode := 'technical_readonly';
  ELSE
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF v_mode IN ('team','owner') THEN
    -- defensor_context.orgao_id é NOT NULL no schema atual; usar bond org quando existir,
    -- ou o próprio contexto operacional do Defensor para 'owner'.
    IF v_bond_org IS NULL THEN
      SELECT orgao_id INTO v_bond_org FROM private.user_operational_context WHERE user_id = p_defensor_user_id;
    END IF;
    IF v_bond_org IS NULL THEN
      RAISE EXCEPTION 'INVALID_DEFENDER_CONTEXT' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.defensor_context (user_id, defensor_user_id, orgao_id)
    VALUES (v_uid, p_defensor_user_id, v_bond_org)
    ON CONFLICT (user_id) DO UPDATE
       SET defensor_user_id = EXCLUDED.defensor_user_id,
           orgao_id         = EXCLUDED.orgao_id,
           updated_at       = now();
  END IF;

  PERFORM private.log_audit_event(
    CASE WHEN v_mode='technical_readonly'
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
    'mode', v_mode
  );

  PERFORM private.complete_idempotency(v_uid, 'user.defender_context_selected', p_idempotency_key, v_result);
  RETURN v_result;
END $fn$;

-- ---------------------------------------------------------------------
-- 8) Grants das novas RPCs
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.encerrar_member_defensor_bond(uuid,bigint,text,uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.selecionar_contexto_defensor(uuid,uuid)                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_member_defensor_bond(uuid,bigint,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.selecionar_contexto_defensor(uuid,uuid)              TO authenticated;

COMMIT;

-- =====================================================================
-- Testes SQL de sanidade (fora da transação, apenas asserts)
-- =====================================================================
DO $$
DECLARE v int;
BEGIN
  -- Índice novo existe e antigo não
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uq_active_member_defensor_bond') THEN
    RAISE EXCEPTION 'TEST_FAIL: novo índice não criado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='member_defensor_bonds_active_uk') THEN
    RAISE EXCEPTION 'TEST_FAIL: índice antigo permanece';
  END IF;
  -- Coluna optimistic_version presente
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='member_defensor_bonds' AND column_name='optimistic_version') THEN
    RAISE EXCEPTION 'TEST_FAIL: optimistic_version ausente';
  END IF;
  -- Grants: authenticated NÃO tem INSERT/UPDATE/DELETE
  SELECT count(*) INTO v FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='member_defensor_bonds'
      AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v <> 0 THEN RAISE EXCEPTION 'TEST_FAIL: authenticated ainda pode mutar diretamente'; END IF;
  -- Trigger de estado presente
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname='member_defensor_bond_state' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'TEST_FAIL: trigger de estado ausente';
  END IF;
  RAISE NOTICE 'TESTS_OK Turno 2';
END $$;