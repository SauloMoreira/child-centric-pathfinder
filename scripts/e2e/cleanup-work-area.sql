-- =========================================================================
-- Cleanup E2E — Ágora / Área de Trabalho
-- Sub-gate 4.1.b · Turno 3.C.3.c.1.a
--
-- Remove exclusivamente registros de UUIDs sintéticos conhecidos
-- (namespace e2e0000*-0000-4000-8000-*). Nunca toca em auth.users,
-- nunca usa TRUNCATE, nunca usa CASCADE, nunca remove por LIKE de nome.
-- =========================================================================

BEGIN;

DO $$
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'e2e' THEN
    RAISE EXCEPTION
      'E2E cleanup refused: app.environment must be e2e (got %)',
      coalesce(current_setting('app.environment', true), '<null>');
  END IF;
END;
$$;

-- Anti-contaminação: se algum row E2E aponta para um item que não é do
-- namespace, aborta em vez de apagar por engano.
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.defensor_workspace_cards
   WHERE workspace_id IN ('e2e00002-0000-4000-8000-000000000001',
                          'e2e00002-0000-4000-8000-000000000002')
     AND item_id NOT LIKE 'e2e00004-%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'E2E cleanup refused: % card(s) sintéticos referenciam itens não-E2E.', v_bad;
  END IF;
END;
$$;

-- Ordem: cards → columns → workspaces → versões/itens → bonds/context → órgão
DELETE FROM public.defensor_workspace_cards
 WHERE id IN (
   'e2e00006-0000-4000-8000-000000000001',
   'e2e00006-0000-4000-8000-000000000002'
 );

DELETE FROM public.defensor_workspace_cards
 WHERE workspace_id IN (
   'e2e00002-0000-4000-8000-000000000001',
   'e2e00002-0000-4000-8000-000000000002'
 );

-- Solta ponteiros de versão antes de tentar remover itens/versões
UPDATE public.content_items
   SET current_version_id = NULL,
       current_published_version_id = NULL
 WHERE id IN (
   'e2e00004-0000-4000-8000-000000000001',
   'e2e00004-0000-4000-8000-000000000002'
 );

DELETE FROM public.defensor_workspace_columns
 WHERE workspace_id IN (
   'e2e00002-0000-4000-8000-000000000001',
   'e2e00002-0000-4000-8000-000000000002'
 );

DELETE FROM public.defensor_workspaces
 WHERE id IN (
   'e2e00002-0000-4000-8000-000000000001',
   'e2e00002-0000-4000-8000-000000000002'
 );

-- content_versions é append-only (trigger tg_content_versions_immutable
-- bloqueia DELETE em prod). Para o namespace E2E, o cleanup depende de
-- disable temporário do trigger — só permitido porque a guarda de ambiente
-- já executou acima. Se o trigger não puder ser destravado, a operação
-- falha explicitamente.
DO $$
BEGIN
  ALTER TABLE public.content_versions DISABLE TRIGGER content_versions_no_delete;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION
    'E2E cleanup requires ALTER TABLE privilege on content_versions.';
END;
$$;

DELETE FROM public.content_versions
 WHERE id IN (
   'e2e00005-0000-4000-8000-000000000001',
   'e2e00005-0000-4000-8000-000000000002'
 );

ALTER TABLE public.content_versions ENABLE TRIGGER content_versions_no_delete;

DELETE FROM public.content_items
 WHERE id IN (
   'e2e00004-0000-4000-8000-000000000001',
   'e2e00004-0000-4000-8000-000000000002'
 );

-- Vínculos e contextos, apenas quando apontam ao órgão E2E
DELETE FROM public.member_defensor_bonds
 WHERE orgao_id = 'e2e00001-0000-4000-8000-000000000001';

DELETE FROM public.defensor_context
 WHERE orgao_id = 'e2e00001-0000-4000-8000-000000000001';

DELETE FROM private.user_operational_context
 WHERE orgao_id = 'e2e00001-0000-4000-8000-000000000001';

-- Órgão sintético
DELETE FROM public.orgaos_execucao
 WHERE id = 'e2e00001-0000-4000-8000-000000000001';

-- Não removemos profiles nem user_roles: são recriados idempotentemente
-- pelo próximo seed e sua remoção violaria FKs de audit_events.

COMMIT;

SELECT '[E2E] cleanup applied' AS status;
