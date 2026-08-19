-- Backing-RPC fuer check:migration-files.
--
-- Problem, das sie loest: Nach Regel 2 laeuft DDL ueber apply_migration — also ZUERST auf
-- prod, das Migration-File wird erst danach committet. Bleibt Schritt 4 aus, ist die
-- Migration getrackt, aber im Repo nicht vorhanden. Das Schema ist dann nicht mehr
-- reproduzierbar, und der Supabase-Preview-Replay stirbt, sobald eine SPAETERE Migration
-- eines der fehlenden Objekte anfasst (19.08. zweimal passiert: 42P01 repo-weit, 7 Files).
--
-- Von aussen ist die Luecke nicht sichtbar: `supabase_migrations` ist kein exponiertes
-- Schema, PostgREST kommt nicht heran. Diese Funktion gibt genau die zwei Spalten frei,
-- die der Abgleich braucht — KEINE `statements` (die enthalten vollstaendiges DDL inkl.
-- Policy-Definitionen; fuer den Soll/Ist-Vergleich reicht die Versionsliste).
--
-- service_role-only, read-only. Muster analog audit_anon_reachable_pii() u. a.

CREATE OR REPLACE FUNCTION public.audit_migration_versions()
 RETURNS TABLE (version text, name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.version, m.name
    FROM supabase_migrations.schema_migrations m
   ORDER BY m.version
$function$;

COMMENT ON FUNCTION public.audit_migration_versions() IS
  'Getrackte Migrations-Versionen fuer den Soll/Ist-Abgleich gegen supabase/migrations/*.sql (check:migration-files). service_role-only, read-only, ohne statements.';

REVOKE ALL ON FUNCTION public.audit_migration_versions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_migration_versions() FROM anon;
REVOKE ALL ON FUNCTION public.audit_migration_versions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_migration_versions() TO service_role;
