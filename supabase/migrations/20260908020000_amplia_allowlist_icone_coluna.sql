-- Ajuste doc (AJUSTE 27 — Novos ícones para as colunas) — a allowlist do
-- backend (CHECK defensor_workspace_columns_icone_ck, criada em
-- 20260901000000_icone_coluna.sql) ficou parada na paleta original de 28
-- ícones. O frontend (src/features/work-area/components/column-icon.tsx)
-- já ganhou, em blocos posteriores, mais 19 ícones temáticos — mas como o
-- CHECK nunca foi atualizado, salvar qualquer um desses ícones novos numa
-- coluna falha silenciosamente do lado do backend (criar_coluna_workspace/
-- atualizar_coluna_workspace rejeitam com violação de constraint), mesmo
-- a escolha aparecendo normalmente no seletor do frontend.
--
-- Esta migration substitui o CHECK pela lista completa e atual de chaves
-- de COLUMN_ICON_ORDER (47 valores). Sempre que novos ícones forem
-- adicionados à paleta do frontend, esta allowlist precisa ser ampliada
-- junto, numa nova migration — o comentário original já avisava disso
-- ("Allowlist do backend — mesma lista de chaves que o frontend usa"),
-- mas o aviso não foi seguido nos blocos seguintes.

ALTER TABLE public.defensor_workspace_columns
  DROP CONSTRAINT IF EXISTS defensor_workspace_columns_icone_ck;

ALTER TABLE public.defensor_workspace_columns
  ADD CONSTRAINT defensor_workspace_columns_icone_ck
  CHECK (icone IS NULL OR icone IN (
    'layers','folder','briefcase','book','gavel','scale','users','user',
    'clipboard','flag','star','bookmark','target','shield','inbox','archive',
    'file-text','heart','home','lightbulb','map-pin','message-square',
    'calendar','graduation-cap','landmark','life-buoy','puzzle','handshake',
    'file-signature','users-round','siren','lock','award','stethoscope',
    'pill','school','baby','receipt','piggy-bank','shopping-cart','banknote',
    'leaf','hand-helping','venus','hand-fist','accessibility','person-standing'
  ));
