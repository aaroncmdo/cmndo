-- CMM Entity-Model Phase 2a (Backfill): personen aus claim_parties befuellen + person_id linken.
-- Dedup (Aaron 03.06.): Account = 1 personen pro user_id; ohne Account = 1 pro Partei-Zeile
-- (KEIN Namens-Auto-Merge). Idempotent (Guards auf NOT EXISTS / person_id IS NULL).
-- Kein Consumer liest personen/person_id -> zero-risk. Fresh-Replay: claim_parties leer -> no-op.

-- A) Account-Personen: 1 personen pro user_id (frueheste Partei je user_id)
INSERT INTO public.personen (user_id, anrede, titel, vorname, nachname, firma, ist_gewerbe,
       geburtsdatum, email, telefon, mobil, adresse_strasse, adresse_plz, adresse_ort, adresse_land,
       fuehrerscheinnummer, fuehrerscheinklassen, ust_id)
SELECT DISTINCT ON (cp.user_id) cp.user_id, cp.anrede, cp.titel, cp.vorname, cp.nachname, cp.firma,
       COALESCE(cp.ist_gewerbe,false), cp.geburtsdatum, cp.email, cp.telefon, cp.mobil,
       cp.adresse_strasse, cp.adresse_plz, cp.adresse_ort, cp.adresse_land,
       cp.fuehrerscheinnummer, cp.fuehrerscheinklassen, cp.ust_id
FROM public.claim_parties cp
WHERE cp.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.personen p WHERE p.user_id = cp.user_id)
ORDER BY cp.user_id, cp.created_at NULLS LAST;

-- B) Account-Parteien linken
UPDATE public.claim_parties cp SET person_id = p.id
FROM public.personen p
WHERE cp.user_id IS NOT NULL AND cp.user_id = p.user_id AND cp.person_id IS NULL;

-- C) Nicht-Account-Parteien: 1 personen pro Partei (kein Auto-Merge) + link
DO $cmm$
DECLARE r record; nid uuid;
BEGIN
  FOR r IN SELECT * FROM public.claim_parties WHERE user_id IS NULL AND person_id IS NULL LOOP
    INSERT INTO public.personen (anrede, titel, vorname, nachname, firma, ist_gewerbe, geburtsdatum,
           email, telefon, mobil, adresse_strasse, adresse_plz, adresse_ort, adresse_land,
           fuehrerscheinnummer, fuehrerscheinklassen, ust_id)
    VALUES (r.anrede, r.titel, r.vorname, r.nachname, r.firma, COALESCE(r.ist_gewerbe,false), r.geburtsdatum,
           r.email, r.telefon, r.mobil, r.adresse_strasse, r.adresse_plz, r.adresse_ort, r.adresse_land,
           r.fuehrerscheinnummer, r.fuehrerscheinklassen, r.ust_id)
    RETURNING id INTO nid;
    UPDATE public.claim_parties SET person_id = nid WHERE id = r.id;
  END LOOP;
END $cmm$;
