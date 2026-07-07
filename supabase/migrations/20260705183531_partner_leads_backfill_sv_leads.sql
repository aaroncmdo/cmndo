-- Partner-CRM Slice B (Erst-Versuch): Backfill sv_leads -> partner_leads.
-- HINWEIS: dieser Lauf migrierte 0 Zeilen, weil alle 62 un-konvertierten sv_leads
-- (DAT-Cold-Pins) KEINE Email haben und partner_leads.email damals NOT NULL war.
-- Der eigentliche Backfill folgt in 20260705184XXX (email -> nullable + re-backfill).
-- File committed fuer Regel-2-Compliance (jede getrackte Migration hat ein File).
INSERT INTO public.partner_leads
  (rolle, status, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, plz, ort, source_channel, rollen_details, erstellt_am)
SELECT
  'sachverstaendiger', 'neu', s.firma, s.vorname, s.nachname, lower(trim(s.email)), s.telefon, s.plz, s.ort, 'dat_import',
  jsonb_strip_nulls(jsonb_build_object(
    'datNr', s.dat_expert_nr, 'bvskNr', s.bvsk_nr, 'oebuvNr', s.oebuv_nr,
    'ihkZertifikat', s.ihk_zertifikat, 'fachschwerpunkte', s.fachschwerpunkte,
    'jahreErfahrung', s.jahre_erfahrung, 'datUrl', s.dat_url, 'name', s.name,
    'quelle_sv_lead_id', s.id::text
  )),
  s.erstellt_am
FROM public.sv_leads s
WHERE s.konvertiert_zu_sv_id IS NULL
  AND s.email IS NOT NULL AND trim(s.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_leads pl
    WHERE pl.rolle = 'sachverstaendiger' AND lower(pl.email) = lower(trim(s.email))
  );
