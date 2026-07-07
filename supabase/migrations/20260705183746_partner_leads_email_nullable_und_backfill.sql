-- Partner-CRM Slice B (final): email nullable + Backfill der 62 DAT-Cold-Pins.
-- Kontaktlose Prospects (Scraping/DAT-Import) haben firma+Adresse aber keine Email/Telefon.
-- Email wird spaeter im CRM angereichert; convertPartnerLead verlangt sie dann (createUser).
-- Daher: partner_leads.email -> nullable. Backfill: sv_leads(un-konvertiert) -> partner_leads
-- als status='neu' + einstufung=null (= "alle Leads muessen eingestuft werden").
-- rollen_details-Keys (datNr/bvskNr/oebuvNr) exakt wie anlegePartnerKern sie liest -> konvertierbar.
-- Dedup auf rollen_details->>'quelle_sv_lead_id' (idempotent auch bei null-Email).
ALTER TABLE public.partner_leads ALTER COLUMN email DROP NOT NULL;

INSERT INTO public.partner_leads
  (rolle, status, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, plz, ort, source_channel, rollen_details, erstellt_am)
SELECT
  'sachverstaendiger',
  'neu',
  s.firma,
  s.vorname,
  s.nachname,
  lower(nullif(trim(s.email), '')),
  nullif(trim(s.telefon), ''),
  s.plz,
  s.ort,
  'dat_import',
  jsonb_strip_nulls(jsonb_build_object(
    'datNr', s.dat_expert_nr,
    'bvskNr', s.bvsk_nr,
    'oebuvNr', s.oebuv_nr,
    'ihkZertifikat', s.ihk_zertifikat,
    'fachschwerpunkte', s.fachschwerpunkte,
    'jahreErfahrung', s.jahre_erfahrung,
    'datUrl', s.dat_url,
    'name', s.name,
    'quelle_sv_lead_id', s.id::text
  )),
  s.erstellt_am
FROM public.sv_leads s
WHERE s.konvertiert_zu_sv_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_leads pl
    WHERE pl.rollen_details->>'quelle_sv_lead_id' = s.id::text
  );
