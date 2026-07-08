-- Partner-Lead Geocoding (⑤): additive Geo-Spalten auf partner_leads.
-- lat/lng aus Google-Geocoding (geocodePartnerLead), strasse + google_place_id
-- fuer vollstaendige Adresse. Alle nullable (Bestandsleads bleiben gueltig).
ALTER TABLE public.partner_leads
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS strasse text,
  ADD COLUMN IF NOT EXISTS google_place_id text;
