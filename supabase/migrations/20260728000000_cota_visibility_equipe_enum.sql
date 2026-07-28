-- Cota · Passo 1/2 — novo valor de enum para visibilidade "equipe do Defensor".
--
-- Precisa estar em migração isolada: PostgreSQL não permite usar um valor de
-- enum recém-adicionado (ALTER TYPE ... ADD VALUE) dentro da mesma transação
-- em que ele foi criado. A migração seguinte (schema/RPCs de Cota) depende
-- deste valor já estar committado.
ALTER TYPE public.content_visibility ADD VALUE 'equipe';
