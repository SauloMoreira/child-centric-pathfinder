
## Diagnóstico prévio (necessário antes de codificar)

Antes de iniciar preciso inspecionar o estado real do banco para respeitar as regras do prompt (não duplicar tabelas, continuar numeração real das migrations, reutilizar enums). Farei:

1. `ls supabase/migrations/` — identificar próximo número disponível.
2. `SELECT` em `information_schema` e `pg_enum` para confirmar:
   - Colunas atuais de `public.assistidos` (já vejo `nome_completo`, `sexo_registral_enum`, `foto_url`, `search_text`).
   - Se existe `public.processos` ou apenas `public.assistido_processos` (tabela atual parece ser esta última, sem N:N real).
   - Enums existentes: `sexo_registral_enum`, `situacao_processo_enum`, `parentesco_enum`, `prioridade_enum`, `tipo_acolhimento_enum`.
   - Buckets de Storage existentes.
   - Função `buscar_assistidos` e função de normalização (`private.normalize_search_text`).
3. Contar registros existentes em `assistidos` e `assistido_processos` para dimensionar backfill.

Só depois do diagnóstico começo as migrations, para não recriar estrutura.

## Escopo da entrega

### A. Frontend — Área de trabalho

`src/routes/_authenticated/area-de-trabalho.tsx`: adicionar, à direita do input de busca, três botões `variant="outline" size="icon" h-10 w-10` (`Baby`, `UserRound`, `Scale`) com tooltip, `aria-label`, foco visível, e wrap em `flex-wrap` para mobile.

### B. Componentes novos

- `src/components/common/{form-section,form-actions,date-field,cpf-field}.tsx`
- `src/components/assistidos/{cadastrar-crianca-sheet,cadastrar-adulto-sheet,vinculo-assistido-picker,foto-assistido-field}.tsx`
- `src/components/processos/cadastrar-processo-sheet.tsx`

### C. Hooks e validadores

- `src/hooks/{use-cadastro-assistido,use-cadastro-processo,use-upload-foto-assistido,use-buscar-assistidos-picker}.ts`
- `src/lib/validators/{cpf,cnj,age,file-upload}.ts` (com `calculateAgeAtDate` timezone `America/Sao_Paulo`).

### D. Migrations versionadas (numeração real a definir após diagnóstico)

Divididas por responsabilidade:

1. **assistidos_extensoes** — enum `assistido_categoria_enum` (`crianca_adolescente|adulto`); adicionar `prenome`, `sobrenome`, `cpf`, `nome_mae`, `nome_pai`, `categoria`, `foto_path` em `public.assistidos`. Backfill de `prenome/sobrenome` a partir de `nome_completo` e `categoria` a partir de `data_nascimento` (registros sem data → categoria NULL + relatório). Índice único parcial em `cpf` (11 dígitos, não excluído). Atualizar `tg_assistidos_prepare` para normalizar espaços, recompor `nome_completo`, normalizar CPF, recalcular `categoria`, rejeitar nascimento futuro e categoria incompatível.
2. **assistido_vinculos** — enum `vinculo_enum` (`pai|mae|familia_extensa|irmao`); tabela `public.assistido_vinculos` com `origem_id`/`destino_id`/`tipo`/`orgao_execucao_id`, GRANT, RLS que exige acesso a ambos os assistidos, unique constraint canônica para irmãos (menor UUID → origem), CHECK impedindo self-link, trigger validando idades por tipo e mesmo órgão.
3. **storage_assistidos_fotos** — bucket privado `assistidos-fotos` (via `supabase--storage_create_bucket`), policies em `storage.objects` amarrando `<orgao_id>/<assistido_id>/…` ao acesso em `public.assistidos`.
4. **processos_n_n** — nova `public.processos` (com `numero_processo_normalizado char(20)`, `data_inicio`, `status`, `orgao_execucao_id`, `deleted_at`) + `public.processo_assistidos` (PK composta). Não removo `assistido_processos` na mesma migration; mantenho documentado como estrutura legada de "processos vinculados diretamente a 1 assistido". Índice único `(orgao_execucao_id, numero_processo_normalizado)`. RLS por acesso ao órgão e ao processo.
5. **rpcs_cadastro_assistidos** — `cadastrar_assistido_crianca`, `cadastrar_assistido_adulto`, `vincular_foto_assistido` (SECURITY DEFINER, `search_path=''`, REVOKE PUBLIC/anon, GRANT authenticated). Órgão vem do vínculo ativo; Admin Técnico exige `orgao_id` + justificativa (audit). Detectam `POSSIBLE_DUPLICATE_ASSISTIDO`, `CPF_ALREADY_EXISTS`, gravam auditoria, retornam JSON estruturado. `duplicateOverrideReason` obrigatório para prosseguir após alerta.
6. **rpc_cadastro_processo** — `cadastrar_processo`: transacional, valida CNJ mod-97, cria processo + N:N, exige ≥1 assistido, verifica acesso a todos, bloqueia número duplicado no escopo, audita.
7. **rls_e_indices** — índices de busca (trgm em `nome_mae`, categoria, etc.) e revisão final de policies.

### E. Regras críticas de segurança

- Categoria SEMPRE recalculada por trigger a partir de `data_nascimento`; payload do frontend nunca é fonte de verdade.
- CPF armazenado como 11 dígitos, mascarado na UI, ausente de logs/auditoria (auditoria grava só ID).
- Upload de foto fora da transação SQL: fluxo (a) RPC cria assistido; (b) client faz upload privado; (c) RPC `vincular_foto_assistido` grava `foto_path`. Falha de upload não desfaz cadastro; falha em (c) tenta remover objeto órfão.
- Vínculos irmão armazenados em forma canônica (ordenação UUID) — consulta é simétrica.
- Nenhuma mutation direta do cliente em `assistidos`/`assistido_vinculos`/`processos` — tudo via RPC.
- `service_role` nunca no cliente.

### F. Fora de escopo desta entrega

- Edição/soft-delete de vínculos existentes via UI (apenas criação).
- Merge automático de duplicidades.
- Migração de `assistido_processos` legado para o novo modelo N:N (documentado, não executado agora para preservar dados existentes).
- Rotina automática de limpeza de fotos órfãs (deixo função SQL preparada mas sem cron).

### G. Verificação final

- Regenerar `src/integrations/supabase/types.ts` após as migrations serem aprovadas.
- Rodar typecheck e build.
- Checklist visual dos três Sheets no preview.

## Ordem de execução

1. Diagnóstico (SELECTs + `ls migrations`).
2. Migrations 1–7 (uma chamada `supabase--migration` cada, respeitando ordem).
3. Storage bucket via tool.
4. Após aprovação, regenerar types e implementar frontend (validadores → hooks → componentes → integração na página).
5. Verificação (typecheck + preview).

Confirma para eu prosseguir? Se quiser posso começar o diagnóstico já na próxima resposta e emendar a primeira migration em seguida.
