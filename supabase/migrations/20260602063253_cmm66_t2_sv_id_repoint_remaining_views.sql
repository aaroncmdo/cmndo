-- CMM-66 Teil 2: sv_id-Repoint f.sv_id -> c.sv_id in den 3 verbliebenen faelle-lesenden Views.
-- Setzt 9d28d3478 (v_claim_full.sv_id -> claims) fort; danach liest KEIN View mehr faelle.sv_id.
--
-- Mechanischer 1-Token-Repoint, kein anderer Spalten-/Zeilen-Change. Paritaet bewiesen:
--   SELECT count(*) FROM faelle f LEFT JOIN claims c ON c.id=f.claim_id WHERE f.sv_id IS DISTINCT FROM c.sv_id  => 0  (75/75 rows, faelle_ohne_claim=0)
-- Methode: pg_get_viewdef + replace('f.sv_id','c.sv_id') + CREATE OR REPLACE.
--   - CREATE OR REPLACE erhaelt Grants + security_invoker-State und erzwingt identische Spaltenliste
--     (Name/Reihenfolge/Typ) -> strukturelle Fehler werden hart abgelehnt, kein Partial-State (DO=1 TX).
--   - Token 'f.sv_id' ist eindeutig (!= gt.sv_id im Termin-Lateral, != t.sv_id AS aktueller_termin_sv_id);
--     je View genau 1 Vorkommen. Idempotent (2. Lauf findet kein f.sv_id mehr -> No-Op).
-- Post-Verify: md5(array_agg(view.* ORDER BY id)) pre==post je View + 0 verbliebene f.sv_id-Refs (siehe PR-Body).
DO $mig$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'public.faelle_kunde_view',
    'public.faelle_sv_view',
    'public.v_faelle_mit_aktuellem_termin'
  ]
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW %s AS %s',
      v,
      replace(pg_get_viewdef(v::regclass, true), 'f.sv_id', 'c.sv_id')
    );
  END LOOP;
END $mig$;
