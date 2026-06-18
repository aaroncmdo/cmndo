-- CMM-49 Claim-Kanonisierung (kunde_email, Schritt 1/N — View-Reader-Migration).
-- claims.kunde_email ist ein Live-Duplikat des geschaedigter-Party->personen.email. Erster,
-- value-erhaltender Schritt: v_claim_full + v_faelle sourcen kunde_email entity-PRIMAER aus der
-- geschaedigter-Party (COALESCE(party.email, c.kunde_email)) — personen wird Primaerquelle,
-- c.kunde_email bleibt Fallback (transitional bis zum Drop).
--
-- VERIFIKATION (18.06.): 83 reale Claims byte-identisch (party.email == c.kunde_email inkl. Case).
-- EINZIGE Aenderung = 1 SYNTHETISCHER Smoke-Test-Claim (CLM-2026-00108): dort war claims.kunde_email
-- NULL, die Party->personen.email aber gesetzt -> COALESCE zeigt jetzt korrekt die SSoT-Email
-- (NULL->"smo***"). Harmlos (Test-Daten) + korrekt (SSoT ist vollstaendiger als das Flat-Dup) —
-- analog zu den akzeptierten synthetischen Seed-Gaps. KEIN reales Daten-Delta.
--
-- Mechanik: fail-loud regexp_replace (a) email ins geschaedigter-LATERAL (kunde_p/cp_g) aufnehmen,
-- (b) kunde_email-Output auf COALESCE umstellen. CREATE OR REPLACE erhaelt reloptions.
-- HINWEIS: transitional — c.kunde_email bleibt referenziert. Drop folgt nach Code-Reader-Migration
-- (push-mandat/lexdrive lesen claims.kunde_email direkt) + Writer-Retirement (convert + FALL_EDITABLE_FIELDS).
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_claim_full'::regclass, true);
  v_new := regexp_replace(v_def, 'SELECT kpe\.vorname,', 'SELECT kpe.vorname, kpe.email,');
  IF v_new = v_def THEN RAISE EXCEPTION 'CMM-49: v_claim_full kunde_p (SELECT kpe.vorname) nicht gefunden'; END IF;
  v_def := v_new;
  v_new := regexp_replace(v_def, 'c\.kunde_email,', 'COALESCE(kunde_p.email, c.kunde_email) AS kunde_email,');
  IF v_new = v_def THEN RAISE EXCEPTION 'CMM-49: v_claim_full c.kunde_email-Output nicht gefunden'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || v_new;

  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  v_new := regexp_replace(v_def, 'SELECT pe\.vorname,', 'SELECT pe.vorname, pe.email,');
  IF v_new = v_def THEN RAISE EXCEPTION 'CMM-49: v_faelle cp_g (SELECT pe.vorname) nicht gefunden'; END IF;
  v_def := v_new;
  v_new := regexp_replace(v_def, 'c\.kunde_email,', 'COALESCE(cp_g.email, c.kunde_email) AS kunde_email,');
  IF v_new = v_def THEN RAISE EXCEPTION 'CMM-49: v_faelle c.kunde_email-Output nicht gefunden'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_new;
END $mig$;
