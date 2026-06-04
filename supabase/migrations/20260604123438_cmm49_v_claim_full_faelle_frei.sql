-- CMM-49 P1: v_claim_full komplett faelle-frei. 8 faelle-Reads repointen, Join -> bridge.
-- fall_status: c.operative_status::fall_status (Enum-Typ ERHALTEN, da CREATE OR REPLACE keinen
-- Typwechsel erlaubt; alle operative_status-Werte sind valide fall_status-Member, 0-diff verifiziert).
-- Verifiziert live: joins_faelle=false, fall_status/fall_created_at/fall_id vs faelle je 0 diff,
-- security_invoker unveraendert, 78 Zeilen. Output-Spalten + Namen erhalten (kein Consumer-Bruch).
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.v_claim_full'::regclass, true);

  ddl := replace(ddl, 'f.id AS fall_id', 'fcb.fall_id AS fall_id');
  ddl := replace(ddl, 'f.status AS fall_status', 'c.operative_status::fall_status AS fall_status');
  ddl := replace(ddl, 'f.created_at AS fall_created_at', 'fcb.fall_created_at AS fall_created_at');
  ddl := replace(ddl, 'f.gegner_anzahl_beteiligte', 'NULL::integer AS gegner_anzahl_beteiligte');
  ddl := replace(ddl, 'f.gegner_fahrzeugtyp', 'NULL::text AS gegner_fahrzeugtyp');
  ddl := replace(ddl, 'f.organisation_id', 'NULL::uuid AS organisation_id');
  ddl := replace(ddl, 'f.dispatch_id', 'NULL::uuid AS dispatch_id');
  ddl := replace(ddl, 'f.kunde_id', 'c.geschaedigter_user_id AS kunde_id');

  ddl := replace(ddl, 'LEFT JOIN faelle f ON f.claim_id = c.id', 'LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id');

  IF ddl ~ '\mf\.' THEN RAISE EXCEPTION 'Rest-f.-Referenz nach Repoint'; END IF;
  IF ddl ~ 'JOIN faelle f' OR ddl ~ 'JOIN faelle ON' THEN RAISE EXCEPTION 'faelle-Join noch vorhanden'; END IF;
  IF position('LEFT JOIN faelle_claim_bridge fcb' IN ddl) = 0 THEN RAISE EXCEPTION 'bridge-Join nicht injiziert'; END IF;
  IF position('fcb.fall_id AS fall_id' IN ddl) = 0 THEN RAISE EXCEPTION 'fall_id-repoint fehlt'; END IF;
  IF position('c.operative_status::fall_status AS fall_status' IN ddl) = 0 THEN RAISE EXCEPTION 'fall_status-repoint fehlt'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || ddl;
END
$mig$;
