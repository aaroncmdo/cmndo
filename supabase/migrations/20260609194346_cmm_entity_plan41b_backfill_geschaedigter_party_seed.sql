-- CMM-Entity Plan 4.1b Prep: geschaedigter-claim_party fuer die 2 Seed-Claims backfillen.
-- CLM-2026-00101 (Aaron-Seed, echte Adresse) + CLM-2026-00102 (SMOKE) hatten flache faelle.kunde_*
-- aber KEINE geschaedigter-Partei (pre-Plan-3-Seed). Damit v_claim_full den kunde-Snapshot
-- (geschaedigter-Party -> COALESCE(person, party-level)) value-preserving liefert (Gate LOSS=0),
-- die Partei aus faelle.kunde_* anlegen. KEINE personen-Entitaet (Test-Junk-Vermeidung; party-level reicht).
-- Set-based + idempotent (NOT EXISTS-Guard verhindert Doppel-Insert + schuetzt die 76 echten Parteien).
INSERT INTO public.claim_parties (claim_id, rolle, quelle, reihenfolge, vorname, nachname, telefon, adresse_strasse, adresse_plz, adresse_ort, firma)
SELECT c.id, 'geschaedigter', 'manuell_kb', 1,
       f.kunde_vorname, f.kunde_nachname, f.kunde_telefon, f.kunde_strasse, f.kunde_plz, f.kunde_stadt, f.firma_name
FROM public.faelle f
JOIN public.faelle_claim_bridge b ON b.fall_id = f.id
JOIN public.claims c ON c.id = b.claim_id
WHERE f.kunde_nachname IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.claim_parties cp WHERE cp.claim_id = c.id AND cp.rolle = 'geschaedigter');
