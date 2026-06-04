-- KORREKTUR (Aaron-Challenge 04.06., Max-Effort-Revalidierung): die halter-LATERAL in v_claim_full
-- (eingefuehrt in 20260604091613) las die PERSONEN-DATEN aus den FLACHEN claim_parties-Spalten
-- (hp.vorname...) statt aus der globalen Entitaet personen. Falsche Schicht: claim_parties = reiner
-- Rolle-Link (person_id -> personen); die Person-DATEN gehoeren in personen. claim_parties.vorname/
-- nachname/adresse sind Legacy-Flat und sterben in Phase 5 (§13-D) -> sonst muesste die View dann
-- erneut umgehaengt werden (kein one-pass). 74/74 Parteien an personen gelinkt, 0 vorname-Mismatch
-- -> value-preserving. Hier: die 8 Person-Daten-Spalten der LATERAL von hp.* auf pe.* (personen)
-- via LEFT JOIN personen pe ON pe.id = hp.person_id. hp.claim_id/ist_halter/reihenfolge/person_id
-- bleiben (Link/Filter). pg_get_viewdef + Replaces + Guards. Ueberlebt den Phase-5-Flat-Drop.
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.v_claim_full'::regclass, true);

  ddl := replace(ddl, 'hp.vorname',         'pe.vorname');
  ddl := replace(ddl, 'hp.nachname',        'pe.nachname');
  ddl := replace(ddl, 'hp.adresse_strasse', 'pe.adresse_strasse');
  ddl := replace(ddl, 'hp.adresse_plz',     'pe.adresse_plz');
  ddl := replace(ddl, 'hp.adresse_ort',     'pe.adresse_ort');
  ddl := replace(ddl, 'hp.telefon',         'pe.telefon');
  ddl := replace(ddl, 'hp.email',           'pe.email');
  ddl := replace(ddl, 'hp.geburtsdatum',    'pe.geburtsdatum');

  ddl := regexp_replace(ddl,
    '(FROM claim_parties hp)(\s+WHERE hp\.claim_id = c\.id AND hp\.ist_halter)',
    E'\\1\n             LEFT JOIN personen pe ON pe.id = hp.person_id\\2');

  IF position('LEFT JOIN personen pe ON pe.id = hp.person_id' IN ddl) = 0 THEN
    RAISE EXCEPTION 'personen-JOIN-Injection hat nicht gegriffen';
  END IF;
  IF ddl ~* '\mhp\.(vorname|nachname|telefon|email|geburtsdatum|adresse_)' THEN
    RAISE EXCEPTION 'hp.<person-daten> noch vorhanden (replace unvollstaendig)';
  END IF;
  IF position('pe.vorname' IN ddl) = 0 THEN
    RAISE EXCEPTION 'pe.vorname fehlt nach repoint';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || ddl;
END
$mig$;
