-- =========================================================================
-- Seed funcional E2E — Ágora / Área de Trabalho
-- Sub-gate 4.1.b · Turno 3.C.3.c.1.a
--
-- ATENÇÃO
--   * Este script NÃO é uma migration. Não colocar em supabase/migrations/.
--   * Ele NUNCA insere, atualiza ou remove linhas em auth.users, auth.identities,
--     auth.sessions, auth.refresh_tokens, auth.mfa_factors ou auth.mfa_challenges.
--   * Ele NUNCA define app.environment por conta própria — a GUC precisa ser
--     definida externamente pelo comando controlado de execução.
--
-- Execução esperada (via scripts/e2e/prepare-environment.ts):
--   PGOPTIONS="-c app.environment=e2e -c app.e2e_owner_email=... \
--                -c app.e2e_team_email=... -c app.e2e_tech_email=..." \
--   psql "$E2E_DATABASE_URL" -f scripts/e2e/seed-work-area.sql
-- =========================================================================

BEGIN;

-- 1. Guarda de ambiente ---------------------------------------------------
DO $$
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'e2e' THEN
    RAISE EXCEPTION
      'E2E seed refused: app.environment must be e2e (got %)',
      coalesce(current_setting('app.environment', true), '<null>')
      USING HINT = 'Set PGOPTIONS="-c app.environment=e2e" externally.';
  END IF;
END;
$$;

-- 2. Resolução dos usuários sintéticos ------------------------------------
-- Emails fornecidos por GUCs externos (app.e2e_owner_email, etc.).
-- Só SELECIONAMOS auth.users; jamais escrevemos nela.
DO $$
DECLARE
  v_owner_email text := nullif(current_setting('app.e2e_owner_email', true), '');
  v_team_email  text := nullif(current_setting('app.e2e_team_email',  true), '');
  v_tech_email  text := nullif(current_setting('app.e2e_tech_email',  true), '');
  v_owner uuid;
  v_team  uuid;
  v_tech  uuid;
BEGIN
  IF v_owner_email IS NULL OR v_team_email IS NULL OR v_tech_email IS NULL THEN
    RAISE EXCEPTION
      'E2E seed refused: emails ausentes (owner/team/tech).'
      USING HINT = 'Set app.e2e_owner_email/app.e2e_team_email/app.e2e_tech_email as GUCs.';
  END IF;

  IF v_owner_email ILIKE '%@dpe-rs.def.br' OR v_team_email ILIKE '%@dpe-rs.def.br'
     OR v_tech_email ILIKE '%@dpe-rs.def.br' THEN
    RAISE EXCEPTION 'E2E seed refused: refusing to touch production-looking email domain.';
  END IF;

  SELECT id INTO v_owner FROM auth.users WHERE email = v_owner_email;
  SELECT id INTO v_team  FROM auth.users WHERE email = v_team_email;
  SELECT id INTO v_tech  FROM auth.users WHERE email = v_tech_email;

  IF v_owner IS NULL OR v_team IS NULL OR v_tech IS NULL THEN
    RAISE EXCEPTION
      'E2E seed refused: usuários sintéticos não encontrados no Auth (owner=%, team=%, tech=%).',
      (v_owner IS NOT NULL), (v_team IS NOT NULL), (v_tech IS NOT NULL)
      USING HINT = 'Bootstrap manual pendente: docs/testing/work-area-e2e-bootstrap.md';
  END IF;

  IF v_owner = v_team OR v_owner = v_tech OR v_team = v_tech THEN
    RAISE EXCEPTION 'E2E seed refused: emails apontam para o mesmo usuário Auth.';
  END IF;

  -- Publica UUIDs para o restante da transação
  PERFORM set_config('app.e2e_owner_uuid', v_owner::text, true);
  PERFORM set_config('app.e2e_team_uuid',  v_team::text,  true);
  PERFORM set_config('app.e2e_tech_uuid',  v_tech::text,  true);
END;
$$;

-- 3. Namespace fixo — UUIDs sintéticos ------------------------------------
-- Prefixos legíveis para facilitar auditoria e o cleanup determinístico.
--   Órgão E2E  ......... e2e00001-0000-...
--   Painéis  ........... e2e00002-000{n}
--   Colunas  ........... e2e00003-000{p}{c}
--   Content items  ..... e2e00004-000{n}
--   Content versions ... e2e00005-000{n}
--   Workspace cards .... e2e00006-000{n}

-- 4. Órgão E2E ------------------------------------------------------------
INSERT INTO public.orgaos_execucao (id, nome, comarca, nome_normalizado, comarca_normalizada)
VALUES (
  'e2e00001-0000-4000-8000-000000000001',
  '[E2E] Defensoria Sintética',
  '[E2E] Comarca Sintética',
  '[e2e] defensoria sintética',
  '[e2e] comarca sintética'
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  comarca = EXCLUDED.comarca,
  nome_normalizado = EXCLUDED.nome_normalizado,
  comarca_normalizada = EXCLUDED.comarca_normalizada;

-- 5. Profiles + papéis ----------------------------------------------------
DO $$
DECLARE
  v_owner uuid := current_setting('app.e2e_owner_uuid')::uuid;
  v_team  uuid := current_setting('app.e2e_team_uuid')::uuid;
  v_tech  uuid := current_setting('app.e2e_tech_uuid')::uuid;
BEGIN
  -- profiles ativos
  INSERT INTO public.profiles (user_id, nome_completo, status, ativo)
  VALUES
    (v_owner, '[E2E] Defensor Owner',       'ativo', true),
    (v_team,  '[E2E] Membro Readonly',      'ativo', true),
    (v_tech,  '[E2E] Técnico Readonly',     'ativo', true)
  ON CONFLICT (user_id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    status = 'ativo',
    ativo = true;

  -- papéis (private.user_roles) — usa índice único parcial em (user_id, role)
  INSERT INTO private.user_roles (user_id, role)
  VALUES
    (v_owner, 'defensor_publico'),
    (v_team,  'membro_equipe'),
    (v_tech,  'admin_tecnico')
  ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL;

  -- vínculo membro → defensor (owner), no órgão E2E
  INSERT INTO public.member_defensor_bonds
    (member_user_id, defensor_user_id, orgao_id, status, created_by)
  VALUES (
    v_team, v_owner,
    'e2e00001-0000-4000-8000-000000000001',
    'ativo',
    v_owner
  )
  ON CONFLICT (member_user_id, defensor_user_id)
    WHERE status = 'ativo' AND ended_at IS NULL
    DO NOTHING;

  -- contexto operacional apontando para o órgão E2E
  INSERT INTO private.user_operational_context (user_id, orgao_id, selected_by)
  VALUES
    (v_owner, 'e2e00001-0000-4000-8000-000000000001', v_owner),
    (v_team,  'e2e00001-0000-4000-8000-000000000001', v_owner),
    (v_tech,  'e2e00001-0000-4000-8000-000000000001', v_tech)
  ON CONFLICT (user_id) DO UPDATE SET
    orgao_id    = EXCLUDED.orgao_id,
    selected_by = EXCLUDED.selected_by,
    updated_at  = now();

  -- defensor_context do owner e do membro apontando para o defensor owner
  INSERT INTO public.defensor_context (user_id, defensor_user_id, orgao_id)
  VALUES
    (v_owner, v_owner, 'e2e00001-0000-4000-8000-000000000001'),
    (v_team,  v_owner, 'e2e00001-0000-4000-8000-000000000001')
  ON CONFLICT (user_id) DO UPDATE SET
    defensor_user_id = EXCLUDED.defensor_user_id,
    orgao_id = EXCLUDED.orgao_id,
    updated_at = now();
END;
$$;

-- 6. Painéis do owner (dois: principal + urgências) -----------------------
DO $$
DECLARE
  v_owner uuid := current_setting('app.e2e_owner_uuid')::uuid;
BEGIN
  INSERT INTO public.defensor_workspaces
    (id, defensor_user_id, orgao_id, nome, icone, order_position)
  VALUES
    ('e2e00002-0000-4000-8000-000000000001',
     v_owner, 'e2e00001-0000-4000-8000-000000000001',
     '[E2E] Painel Principal', 'layers', 0),
    ('e2e00002-0000-4000-8000-000000000002',
     v_owner, 'e2e00001-0000-4000-8000-000000000001',
     '[E2E] Painel Urgências', 'flag', 1)
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    icone = EXCLUDED.icone,
    order_position = EXCLUDED.order_position,
    archived_at = NULL;
END;
$$;

-- 7. Colunas dos Painéis --------------------------------------------------
-- Deferrable unique em (workspace_id, order_position) permite reordenar
-- dentro da mesma transação sem violação intermediária.
INSERT INTO public.defensor_workspace_columns
  (id, workspace_id, nome, order_position, cor_token)
VALUES
  ('e2e00003-0000-4000-8000-000000000101',
   'e2e00002-0000-4000-8000-000000000001',
   '[E2E] Entrada',      0, 'neutral'),
  ('e2e00003-0000-4000-8000-000000000102',
   'e2e00002-0000-4000-8000-000000000001',
   '[E2E] Análise',      1, 'neutral'),
  ('e2e00003-0000-4000-8000-000000000103',
   'e2e00002-0000-4000-8000-000000000001',
   '[E2E] Finalizados',  2, 'neutral'),
  ('e2e00003-0000-4000-8000-000000000201',
   'e2e00002-0000-4000-8000-000000000002',
   '[E2E] Aguardando',   0, 'neutral')
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  nome = EXCLUDED.nome,
  order_position = EXCLUDED.order_position,
  cor_token = EXCLUDED.cor_token;

-- 8. Content items + versões publicadas -----------------------------------
DO $$
DECLARE
  v_owner uuid := current_setting('app.e2e_owner_uuid')::uuid;
BEGIN
  INSERT INTO public.content_items
    (id, kind, owner_user_id, orgao_id, visibility, status)
  VALUES
    ('e2e00004-0000-4000-8000-000000000001',
     'atendimento', v_owner,
     'e2e00001-0000-4000-8000-000000000001',
     'privado', 'publicado'),
    ('e2e00004-0000-4000-8000-000000000002',
     'cota', v_owner,
     'e2e00001-0000-4000-8000-000000000001',
     'privado', 'publicado')
  ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind,
    owner_user_id = EXCLUDED.owner_user_id,
    orgao_id = EXCLUDED.orgao_id,
    visibility = EXCLUDED.visibility,
    status = EXCLUDED.status;

  -- versões publicadas (triggers impedem UPDATE/DELETE — usar INSERT-only)
  INSERT INTO public.content_versions
    (id, item_id, version_number, title, body_json, body_text,
     created_by, is_published, published_at)
  VALUES
    ('e2e00005-0000-4000-8000-000000000001',
     'e2e00004-0000-4000-8000-000000000001',
     1, '[E2E] Atendimento Sintético A', '{}'::jsonb, '',
     v_owner, true, now()),
    ('e2e00005-0000-4000-8000-000000000002',
     'e2e00004-0000-4000-8000-000000000002',
     1, '[E2E] Cota Sintética B', '{}'::jsonb, '',
     v_owner, true, now())
  ON CONFLICT (id) DO NOTHING;

  -- ponteiros current/published
  UPDATE public.content_items
     SET current_version_id           = 'e2e00005-0000-4000-8000-000000000001',
         current_published_version_id = 'e2e00005-0000-4000-8000-000000000001'
   WHERE id = 'e2e00004-0000-4000-8000-000000000001';

  UPDATE public.content_items
     SET current_version_id           = 'e2e00005-0000-4000-8000-000000000002',
         current_published_version_id = 'e2e00005-0000-4000-8000-000000000002'
   WHERE id = 'e2e00004-0000-4000-8000-000000000002';
END;
$$;

-- 9. Cards do Painel Principal --------------------------------------------
INSERT INTO public.defensor_workspace_cards
  (id, workspace_id, column_id, item_id, order_position)
VALUES
  ('e2e00006-0000-4000-8000-000000000001',
   'e2e00002-0000-4000-8000-000000000001',
   'e2e00003-0000-4000-8000-000000000101',
   'e2e00004-0000-4000-8000-000000000001', 0),
  ('e2e00006-0000-4000-8000-000000000002',
   'e2e00002-0000-4000-8000-000000000001',
   'e2e00003-0000-4000-8000-000000000101',
   'e2e00004-0000-4000-8000-000000000002', 1)
ON CONFLICT (id) DO UPDATE SET
  workspace_id  = EXCLUDED.workspace_id,
  column_id     = EXCLUDED.column_id,
  order_position = EXCLUDED.order_position;

COMMIT;

-- Marcador de sucesso legível pelo prepare-environment.ts
SELECT '[E2E] seed applied' AS status;
