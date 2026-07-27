-- Gate 4.1.a: least-privilege on all project SECURITY DEFINER functions.
-- Revoke broad grants from PUBLIC and anon on every SECURITY DEFINER function
-- in schemas public and private, then re-grant EXECUTE to authenticated only
-- for public-schema RPCs. Private helpers stay callable only by function
-- owners (they run inside other SECURITY DEFINER routines / triggers).

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
      fn.schema_name, fn.func_name, fn.args
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon',
      fn.schema_name, fn.func_name, fn.args
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM authenticated',
      fn.schema_name, fn.func_name, fn.args
    );

    IF fn.schema_name = 'public' THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
        fn.schema_name, fn.func_name, fn.args
      );
    END IF;
  END LOOP;
END
$$;

-- Ensure future functions created in these schemas do not inherit broad
-- EXECUTE grants for PUBLIC / anon (defensive default).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;