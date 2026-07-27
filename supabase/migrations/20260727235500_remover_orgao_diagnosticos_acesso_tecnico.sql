BEGIN;

-- ============================================================
-- Últimas dependências funcionais de órgão de execução nas telas
-- técnicas de acesso global e acesso emergencial (break-glass).
-- Ambas eram auditorias de "acesso a órgão externo"; passam a
-- auditar acesso ao contexto de um Defensor Público, coerente com
-- o eixo do sistema (ver 20260727230000).
-- ============================================================

-- ------------------------------------------------------------
-- 1) registrar_acesso_orgao_externo -> registrar_acesso_defensor_externo
--    O parâmetro de órgão vira Defensor. O antigo audit_log.orgao_id
--    tem FK para orgaos_execucao, então não é mais preenchido — o
--    Defensor auditado vai em entity/entity_id e nos metadados.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_acesso_orgao_externo(uuid, text, text);

CREATE FUNCTION public.registrar_acesso_defensor_externo(
  p_defensor_user_id uuid,
  p_modulo text,
  p_finalidade text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'Registro reservado ao Administrador Técnico em acesso global.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.log_audit_event(
    'tecnico.access_defensor','defensor', COALESCE(p_defensor_user_id::text,'*'),
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'defensor_user_id', p_defensor_user_id,
      'modulo', p_modulo,
      'finalidade', p_finalidade
    ),
    NULL, v_corr, 'admin_tecnico'::public.app_role
  );

  RETURN jsonb_build_object('ok', true, 'correlation_id', v_corr);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_acesso_defensor_externo(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_acesso_defensor_externo(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_acesso_defensor_externo(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) registrar_break_glass: "órgão afetado (opcional)" vira
--    "Defensor afetado (opcional)". Mesma lógica de auditoria,
--    sem preencher o audit_log.orgao_id legado.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_break_glass(uuid, text, text, integer);

CREATE FUNCTION public.registrar_break_glass(
  p_defensor_user_id uuid,
  p_justificativa text,
  p_chamado text,
  p_prazo_minutos integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_admin_tecnico() THEN
    RAISE EXCEPTION 'Acesso emergencial restrito ao Administrador Técnico.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.current_user_has_aal2() THEN
    RAISE EXCEPTION 'MFA (AAL2) é obrigatório para acesso emergencial.' USING ERRCODE = '42501';
  END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) < 20 THEN
    RAISE EXCEPTION 'Justificativa institucional é obrigatória (mínimo 20 caracteres).'
      USING ERRCODE = '22023';
  END IF;
  IF p_chamado IS NULL OR length(btrim(p_chamado)) < 3 THEN
    RAISE EXCEPTION 'Referência de chamado é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_prazo_minutos, 0) NOT BETWEEN 5 AND 240 THEN
    RAISE EXCEPTION 'Prazo do acesso emergencial deve estar entre 5 e 240 minutos.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.log_audit_event(
    'tecnico.break_glass.open','defensor', COALESCE(p_defensor_user_id::text,'*'),
    'sucesso'::public.audit_result, NULL,
    jsonb_build_object(
      'defensor_user_id', p_defensor_user_id,
      'justificativa', btrim(p_justificativa),
      'chamado', btrim(p_chamado),
      'prazo_minutos', p_prazo_minutos,
      'expira_em', (now() + make_interval(mins => p_prazo_minutos))
    ),
    NULL, v_corr, 'admin_tecnico'::public.app_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'correlation_id', v_corr,
    'expira_em', (now() + make_interval(mins => p_prazo_minutos))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_break_glass(uuid, text, text, integer) TO authenticated;

COMMIT;
