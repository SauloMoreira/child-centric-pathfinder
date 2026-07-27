-- Gate 4: eliminação definitiva de PII legada

DROP FUNCTION IF EXISTS public.atualizar_anotacoes_assistido(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.atualizar_assistido_adulto CASCADE;
DROP FUNCTION IF EXISTS public.atualizar_assistido_crianca CASCADE;
DROP FUNCTION IF EXISTS public.buscar_assistidos CASCADE;
DROP FUNCTION IF EXISTS public.buscar_assistidos_picker CASCADE;
DROP FUNCTION IF EXISTS public.cadastrar_assistido_adulto CASCADE;
DROP FUNCTION IF EXISTS public.cadastrar_assistido_crianca CASCADE;
DROP FUNCTION IF EXISTS public.cadastrar_processo CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_column_assistidos CASCADE;
DROP FUNCTION IF EXISTS public.remover_foto_assistido CASCADE;
DROP FUNCTION IF EXISTS public.vincular_foto_assistido CASCADE;
DROP FUNCTION IF EXISTS public.tg_assistido_vinculos_validate CASCADE;
DROP FUNCTION IF EXISTS public.tg_assistidos_prepare CASCADE;
DROP FUNCTION IF EXISTS private.user_can_access_assistido(uuid) CASCADE;

DROP VIEW IF EXISTS public.v_assistidos_card CASCADE;

DROP TABLE IF EXISTS public.processo_assistidos CASCADE;
DROP TABLE IF EXISTS public.assistido_vinculos CASCADE;
DROP TABLE IF EXISTS public.assistido_providencias CASCADE;
DROP TABLE IF EXISTS public.assistido_processos CASCADE;
DROP TABLE IF EXISTS public.assistido_familiares CASCADE;
DROP TABLE IF EXISTS public.assistido_acolhimentos CASCADE;
DROP TABLE IF EXISTS public.processos CASCADE;
DROP TABLE IF EXISTS public.assistidos CASCADE;

DROP TYPE IF EXISTS public.situacao_atual_enum CASCADE;
DROP TYPE IF EXISTS public.tipo_acolhimento_enum CASCADE;
DROP TYPE IF EXISTS public.parentesco_enum CASCADE;
DROP TYPE IF EXISTS public.situacao_processo_enum CASCADE;
DROP TYPE IF EXISTS public.prioridade_enum CASCADE;
DROP TYPE IF EXISTS public.sexo_registral_enum CASCADE;
DROP TYPE IF EXISTS public.assistido_categoria_enum CASCADE;
DROP TYPE IF EXISTS public.vinculo_enum CASCADE;