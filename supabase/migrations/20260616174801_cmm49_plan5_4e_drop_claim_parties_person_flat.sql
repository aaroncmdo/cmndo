-- CMM-49 Entity Plan-5 (4e): DROP der 17 Person-flat-Spalten auf claim_parties (IRREVERSIBEL).
-- Personen-Daten leben jetzt ausschliesslich in personen (via person_id). Vorbedingungen erfuellt:
-- #2963 (Reader/Writer-Code) auf prod deployed; 0 Daten-Divergenz; 4a-View-Flips appliziert ->
-- 0 named-deps (V3) + 0 normal pg_depend + RLS-Policies referenzieren keine Person-cols.
-- KEEP: id, claim_id, rolle, reihenfolge, user_id, person_id, previous_person_id, firma_id,
-- vehicle_id, versicherung_id, ist_halter/_fahrer/_fahrzeuginsasse, hat_personenschaden,
-- verletzungsart, krankenhaus_name, arbeitsunfaehig_*, airdrop_*, beziehung_zum_halter,
-- ist_aktiv/_anonymisiert, anonymisiert_am, quelle, notiz, created/updated_at, created_by_user_id,
-- kennzeichen(+parts), fahrzeugtyp_klartext, versicherung_klartext/nummer/aktenzeichen.
ALTER TABLE public.claim_parties
  DROP COLUMN vorname,
  DROP COLUMN nachname,
  DROP COLUMN firma,
  DROP COLUMN ist_gewerbe,
  DROP COLUMN geburtsdatum,
  DROP COLUMN anrede,
  DROP COLUMN titel,
  DROP COLUMN ust_id,
  DROP COLUMN telefon,
  DROP COLUMN mobil,
  DROP COLUMN email,
  DROP COLUMN adresse_strasse,
  DROP COLUMN adresse_plz,
  DROP COLUMN adresse_ort,
  DROP COLUMN adresse_land,
  DROP COLUMN fuehrerscheinklassen,
  DROP COLUMN fuehrerscheinnummer;
