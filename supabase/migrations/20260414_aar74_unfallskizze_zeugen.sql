-- AAR-74: SLA-Meeting LexDrive — Unfallort-Kategorie + Skizze + Zeugen
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallort_kategorie TEXT
  CHECK (unfallort_kategorie IN ('parkluecke','kreuzung','autobahn','landstrasse','innerorts','sonstiges'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallskizze_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zeuge_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zeuge_anschrift TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zeuge_telefon TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zeuge_email TEXT;

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS unfallort_kategorie TEXT
  CHECK (unfallort_kategorie IN ('parkluecke','kreuzung','autobahn','landstrasse','innerorts','sonstiges'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS unfallskizze_url TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zeuge_name TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zeuge_anschrift TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zeuge_telefon TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS zeuge_email TEXT;
