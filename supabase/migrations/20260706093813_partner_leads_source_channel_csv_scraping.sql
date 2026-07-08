-- Partner-CRM Slice C+E: source_channel um 'csv_import' (CSV-Bulk-Upload) + 'scraping'
-- (Lead-Scraping, Slice E) erweitern. CHECK-Constraint ersetzen (additiv = nur neue
-- erlaubte Werte, kein Datenverlust).
ALTER TABLE public.partner_leads DROP CONSTRAINT partner_leads_source_channel_check;
ALTER TABLE public.partner_leads ADD CONSTRAINT partner_leads_source_channel_check
  CHECK (source_channel IN ('self_signup','marketing_bewerbung','dat_import','admin','empfehlung','csv_import','scraping'));
