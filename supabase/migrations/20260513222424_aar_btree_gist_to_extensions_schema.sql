-- AAR-886: btree_gist Extension aus public nach extensions verschieben.
--
-- Audit 13.05.2026 P3.5: Lint `extension_in_public`. Best-Practice
-- (Supabase + Postgres) ist, Extensions in ein separates Schema zu legen,
-- damit der `public`-Namespace nur App-Objekte enthält.
--
-- Dependencies (2 EXCLUSION-Constraints mit btree_gist-Operator-Class
-- für `uuid WITH =`):
--   - gutachter_termine.gutachter_termine_no_sv_overlap (AAR-865)
--   - gutachter_finder_anfragen.gfa_slot_exclusion
--
-- ALTER EXTENSION ... SET SCHEMA aktualisiert pg_depend-Referenzen
-- automatisch — Constraints bleiben funktional intakt.
--
-- Default search_path (`"$user", public, extensions`) enthält `extensions`,
-- daher funktionieren auch unqualified Operator-Class-Lookups weiter.

alter extension btree_gist set schema extensions;
