-- 0010_add_admin_tecnico_role.sql
-- Adiciona o novo perfil master admin_tecnico ao enum app_role.
-- ALTER TYPE ... ADD VALUE precisa ser aplicado em uma migration separada
-- antes de ser referenciado em funções e policies (0011_admin_tecnico_security.sql).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_tecnico' BEFORE 'admin_institucional';