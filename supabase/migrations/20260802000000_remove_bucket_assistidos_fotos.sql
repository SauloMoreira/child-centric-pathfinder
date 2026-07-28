-- Gate 4 (conclusão): remove a policy órfã de bloqueio total do bucket
-- "assistidos-fotos". O domínio legado de "assistidos" (tabelas, funções e
-- enums) já havia sido totalmente removido na migração 20260727153138
-- ("Gate 4: eliminação definitiva de PII legada"); esta policy
-- (20260727151015) não tem mais finalidade.
--
-- O bucket em si e seus objetos NÃO são removidos aqui: o Supabase bloqueia
-- DELETE direto em storage.objects/storage.buckets via SQL ("Direct deletion
-- from storage tables is not allowed. Use the Storage API instead."). O
-- bucket "assistidos-fotos" precisa ser excluído manualmente pela aba
-- Storage do painel (Lovable/Supabase) — confirmado que não contém fotos
-- reais, então é seguro apagar por lá.

DROP POLICY IF EXISTS assistidos_fotos_gate1_deny ON storage.objects;
