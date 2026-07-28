-- Correções de segurança apontadas pelo Advisor (Lovable/Supabase Database
-- Linter): 4 falhas CRÍTICAS de RLS + 3 avisos de privilégio excessivo em
-- funções SECURITY DEFINER.
--
-- Contexto encontrado durante a investigação (réplica Postgres local):
--
-- 1) As 4 policies críticas usavam EXISTS(SELECT 1 FROM <tabela pai> ...)
--    sem repetir o predicado de visibilidade/posse da tabela pai — em teoria
--    o RLS da tabela pai ainda se aplica dentro do EXISTS, mas o Advisor
--    classifica esse padrão como crítico por não ser auto-contido/auditável
--    e por depender de policies de outra tabela nunca mudarem. Reescritas
--    para checar a posse/visibilidade diretamente, sem depender de RLS
--    transitivo.
--
-- 2) Ao investigar, descobriu-se que a migração de hardening "Gate 4.1.a"
--    (20260727160309) revogou EXECUTE de TODAS as funções SECURITY DEFINER
--    do schema private para PUBLIC/anon/authenticated, sem re-conceder para
--    as poucas que são chamadas DIRETAMENTE de dentro de policies RLS
--    (contexto do invocador, não de uma RPC SECURITY DEFINER). Isso deixou
--    private.current_operational_org_id() e private.user_can_act_for_defensor()
--    sem GRANT para authenticated, quebrando silenciosamente (erro de
--    permissão, não vazamento) a visibilidade "orgao"/"equipe" de
--    content_items sempre que uma policy que as chama precisasse ser
--    avaliada para uma linha de outro usuário. Corrigido restaurando os
--    GRANTs necessários.
--
-- 3) Também via auditoria, algumas funções SECURITY DEFINER criadas DEPOIS
--    da migração de hardening (private.can_view_workspace, e helpers
--    internos private.assert_authenticated_defensor / private.panel_owner,
--    além de 2 funções de trigger em public) nunca tiveram GRANT/REVOKE
--    explícitos e por isso herdaram o padrão default do Postgres (EXECUTE
--    liberado para PUBLIC, incluindo anon). Corrigido trancando cada uma
--    para o mínimo necessário.
--
-- 4) private.validate_panel_icon/validate_panel_name não tinham
--    "SET search_path" fixo (aviso "Function Search Path Mutable").

-- ---------------------------------------------------------------------------
-- A) Helper único e auto-contido de visibilidade de content_items, para ser
--    chamado diretamente por policies de tabelas filhas (categorias e
--    versões). Replica exatamente as 3 regras de content_items
--    (dono · publicado+institucional · publicado+orgao) e concerta o bug de
--    content_items_select_cota_equipe (que comparava orgao_id = NULL e por
--    isso nunca reconhecia um vínculo de equipe real — aqui o vínculo de
--    equipe para cota é checado sem exigir órgão, já que cota não tem
--    orgao_id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_view_content_item(p_user uuid, p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.content_items i
     WHERE i.id = p_item_id
       AND i.deleted_at IS NULL
       AND (
         i.owner_user_id = p_user
         OR (i.status = 'publicado' AND i.visibility = 'institucional')
         OR (
           i.status = 'publicado' AND i.visibility = 'orgao'
           AND i.orgao_id IS NOT NULL
           AND i.orgao_id = private.current_operational_org_id()
         )
         OR (
           i.kind = 'cota' AND i.status = 'publicado' AND i.visibility = 'equipe'
           AND EXISTS (
             SELECT 1 FROM public.member_defensor_bonds b
              WHERE b.member_user_id = p_user
                AND b.defensor_user_id = i.owner_user_id
                AND b.status = 'ativo'
           )
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION private.can_view_content_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_content_item(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- B) 4 policies críticas: reescritas para checagem direta/auto-contida.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS content_item_categories_select_via_item ON public.content_item_categories;
CREATE POLICY content_item_categories_select_via_item
  ON public.content_item_categories
  FOR SELECT TO authenticated
  USING (private.can_view_content_item(auth.uid(), item_id));

DROP POLICY IF EXISTS content_versions_select_via_item ON public.content_versions;
CREATE POLICY content_versions_select_via_item
  ON public.content_versions
  FOR SELECT TO authenticated
  USING (private.can_view_content_item(auth.uid(), item_id));

DROP POLICY IF EXISTS defensor_workspace_columns_select ON public.defensor_workspace_columns;
CREATE POLICY defensor_workspace_columns_select
  ON public.defensor_workspace_columns
  FOR SELECT TO authenticated
  USING (private.can_view_workspace(auth.uid(), workspace_id));

DROP POLICY IF EXISTS defensor_workspace_cards_select ON public.defensor_workspace_cards;
CREATE POLICY defensor_workspace_cards_select
  ON public.defensor_workspace_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.defensor_workspace_columns c
       WHERE c.id = defensor_workspace_cards.column_id
         AND private.can_view_workspace(auth.uid(), c.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- C) Restaura GRANTs de funções chamadas diretamente por policies RLS
--    (contexto do invocador) que a varredura "Gate 4.1.a" bloqueou por
--    engano.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.current_operational_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_operational_org_id() TO authenticated;

REVOKE ALL ON FUNCTION private.user_can_act_for_defensor(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_can_act_for_defensor(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- D) Tranca funções que herdaram EXECUTE aberto a PUBLIC/anon por nunca
--    terem tido REVOKE/GRANT explícitos (criadas após a varredura "Gate
--    4.1.a"). can_view_workspace precisa continuar chamável por
--    authenticated (é usada direto em policies); as demais são só
--    auxiliares internas (chamadas de dentro de outras funções SECURITY
--    DEFINER, que rodam como o dono) ou funções de trigger — não precisam
--    de EXECUTE concedido a ninguém.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.can_view_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_workspace(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.assert_authenticated_defensor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.panel_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_content_items_pointer_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_member_defensor_bond_state() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- E) search_path fixo (aviso "Function Search Path Mutable").
-- ---------------------------------------------------------------------------
ALTER FUNCTION private.validate_panel_icon(text) SET search_path = '';
ALTER FUNCTION private.validate_panel_name(text) SET search_path = '';
