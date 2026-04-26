-- AAR-841 Step 3/3: Settings-Rows für Partnerkanzlei (LexDrive)
--
-- Werden von sendKanzleiPaket gelesen wenn empfaenger_typ='partnerkanzlei'.
-- settings-Schema hat nur key/value/updated_at — keine beschreibung-Spalte.

INSERT INTO public.settings (key, value) VALUES
  ('kanzlei_partner_name',           'LexDrive'),
  ('kanzlei_partner_email',          'eingang@lexdrive.de'),
  ('kanzlei_partner_telefon',        '+4915112345678'),
  ('kanzlei_partner_whatsapp_url',   'https://wa.me/4915112345678'),
  ('kanzlei_partner_termin_url',     'https://lexdrive.de/termin'),
  ('kanzlei_partner_kontaktperson',  'Dr. Schmidt')
ON CONFLICT (key) DO NOTHING;

-- Hinweis: ON CONFLICT NOTHING — bestehende Settings werden NICHT überschrieben
-- (z.B. wenn Aaron schon einen anderen Partner-Namen gesetzt hat).
