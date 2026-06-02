-- CMM-74 b'': Repoint der faelle.status-exponierenden Views auf den SSoT-Cursor
-- claims.operative_status. v_faelle_mit_aktuellem_termin / faelle_kunde_view /
-- faelle_sv_view selektieren noch f.status. Nach dem A3-Write-Stopp friert
-- faelle.status ein -> diese Views muessen den lebenden Cursor lesen.
-- COALESCE(c.operative_status::fall_status, f.status) erhaelt den Spaltentyp
-- (fall_status, noetig fuer CREATE OR REPLACE) und faellt fuer (0) claim-lose
-- Legacy-Faelle auf f.status zurueck. operative_status spiegelt faelle.status
-- 1:1 (0 Mismatch) -> verhaltensneutral heute. Server-seitig aus der Live-Def
-- generiert (kein Transkriptions-Risiko), pro View geguardet.
DO $mig$
DECLARE
  v text;
  ddl text;
BEGIN
  FOREACH v IN ARRAY ARRAY['v_faelle_mit_aktuellem_termin','faelle_kunde_view','faelle_sv_view']
  LOOP
    ddl := 'CREATE OR REPLACE VIEW public.' || quote_ident(v) || ' AS ' ||
      replace(
        pg_get_viewdef(('public.' || v)::regclass, true),
        E'    f.status,\n',
        E'    COALESCE(c.operative_status::fall_status, f.status) AS status,\n'
      );
    EXECUTE ddl;
    IF position('operative_status::fall_status' IN pg_get_viewdef(('public.' || v)::regclass, true)) = 0 THEN
      RAISE EXCEPTION 'CMM-74 view-repoint failed for %: operative_status::fall_status missing after CREATE OR REPLACE', v;
    END IF;
  END LOOP;
END
$mig$;
