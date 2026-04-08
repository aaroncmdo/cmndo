-- KFZ-150: Case-Storno + Reklamation + Gutschrift

-- Faelle: Storno-Felder
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS storniert_am TIMESTAMPTZ NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS storno_grund TEXT NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS storno_durch_user_id UUID NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS no_show_gemeldet_am TIMESTAMPTZ NULL;

-- Reklamationen
CREATE TABLE IF NOT EXISTS reklamationen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id),
  grund TEXT NOT NULL CHECK (grund IN ('kein_haftpflichtschaden','bagatelle_unter_750','unvollstaendige_kundendaten','sonstiges')),
  begruendung TEXT NOT NULL,
  nachweis_storage_path TEXT NULL,
  eingereicht_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  bearbeitet_am TIMESTAMPTZ NULL,
  bearbeitet_von UUID NULL,
  status TEXT NOT NULL DEFAULT 'eingereicht' CHECK (status IN ('eingereicht','pruefung','berechtigt','abgelehnt','auto_abgelehnt_frist')),
  admin_begruendung TEXT NULL,
  frist_bis TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reklamationen_status ON reklamationen(status);
CREATE INDEX IF NOT EXISTS idx_reklamationen_fall ON reklamationen(fall_id);

-- Gutschriften
CREATE TABLE IF NOT EXISTS gutschriften (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id),
  betrag_netto NUMERIC(10,2) NOT NULL,
  mwst_betrag NUMERIC(10,2) NOT NULL,
  betrag_brutto NUMERIC(10,2) NOT NULL,
  grund TEXT NOT NULL,
  referenz_fall_id UUID NULL REFERENCES faelle(id),
  referenz_abrechnung_id UUID NULL REFERENCES abrechnungen(id),
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','verrechnet','ausgezahlt','storniert')),
  verrechnet_in_abrechnung_id UUID NULL REFERENCES abrechnungen(id),
  ausgezahlt_am TIMESTAMPTZ NULL,
  stripe_refund_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gutschriften_gutachter_offen ON gutschriften(gutachter_id, status);

-- Abrechnungen: Storno-Felder
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS storniert_am TIMESTAMPTZ NULL;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS storniert_grund TEXT NULL;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS ersetzt_durch_abrechnung_id UUID NULL;
