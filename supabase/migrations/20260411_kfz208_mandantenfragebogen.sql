-- KFZ-208: Schadenkonstellation + Mandantenfragebogen Felder

-- Schadenkonstellation (Step 1 im Qualifizierungsgespräch)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ist_fahrzeughalter BOOLEAN DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finanzierung_leasing TEXT
  DEFAULT 'keine' CHECK (finanzierung_leasing IN ('keine','finanzierung','leasing'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vorsteuerabzugsberechtigt BOOLEAN DEFAULT false;

-- Halter-Daten (nur Pflicht wenn ist_fahrzeughalter = false)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_vorname TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_nachname TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_strasse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_plz TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_stadt TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_telefon TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_email TEXT;

-- Finanzierungs-/Leasinggeber (nur Pflicht wenn finanzierung_leasing != 'keine')
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finanzierungsgeber_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finanzierungsgeber_adresse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finanzierungsgeber_vertragsnr TEXT;

-- Kunden-Adresse aufgesplittet
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_strasse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_plz TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kunde_stadt TEXT;

-- Schadenhergang als Freitext
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schadenhergang TEXT;

-- Gleiche Felder in faelle (für Kanzlei-Übergabe)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ist_fahrzeughalter BOOLEAN DEFAULT true;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS finanzierung_leasing TEXT
  DEFAULT 'keine' CHECK (finanzierung_leasing IN ('keine','finanzierung','leasing'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorsteuerabzugsberechtigt BOOLEAN DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schadenhergang TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_vorname TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_nachname TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_strasse TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_plz TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_stadt TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_telefon TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS halter_email TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS finanzierungsgeber_name TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS finanzierungsgeber_adresse TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS finanzierungsgeber_vertragsnr TEXT;
