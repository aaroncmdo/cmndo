-- KFZ-149: Monatliche SV-Abrechnung mit per-case Guthaben-Verrechnung

-- Lead-Preis-Tabelle (CRUD via Admin)
CREATE TABLE IF NOT EXISTS leadpreise_tabelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schadenhoehe_bis_netto NUMERIC(10,2) NOT NULL,
  paketpreis_netto NUMERIC(10,2) NOT NULL,
  einzelpreis_netto NUMERIC(10,2) NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  aktiv BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leadpreise_aktiv_grenze ON leadpreise_tabelle(aktiv, schadenhoehe_bis_netto);

-- Sachverstaendige erweitern
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS werbebudget_guthaben_netto NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gesperrt_grund TEXT NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gesperrt_seit TIMESTAMPTZ NULL;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS kontingent_soll INTEGER NULL;

-- Faelle erweitern (per-case Abrechnung)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lead_preis_netto NUMERIC(10,2) NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lead_preis_typ TEXT NULL CHECK (lead_preis_typ IN ('paket','einzel'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS lead_preis_berechnet_am TIMESTAMPTZ NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS guthaben_verrechnet_netto NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS sv_nachzahlung_netto NUMERIC(10,2) NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS abrechnung_id UUID NULL;

-- Abrechnungen
CREATE TABLE IF NOT EXISTS abrechnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachter_id UUID NOT NULL REFERENCES sachverstaendige(id) ON DELETE RESTRICT,
  abrechnungsmonat INT NOT NULL CHECK (abrechnungsmonat BETWEEN 1 AND 12),
  abrechnungsjahr INT NOT NULL,
  bruttoabrechnung_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  guthaben_verrechnung_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  endbetrag_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  mwst_betrag NUMERIC(10,2) NOT NULL DEFAULT 0,
  endbetrag_brutto NUMERIC(10,2) NOT NULL DEFAULT 0,
  guthaben_neu NUMERIC(10,2) NOT NULL DEFAULT 0,
  rechnungsnummer TEXT UNIQUE NOT NULL,
  pdf_storage_path TEXT NULL,
  status TEXT NOT NULL DEFAULT 'erstellt' CHECK (status IN ('erstellt','versendet','bezahlt','fehlgeschlagen','gesperrt','storniert')),
  faelligkeitsdatum DATE NOT NULL,
  versendet_am TIMESTAMPTZ NULL,
  bezahlt_am TIMESTAMPTZ NULL,
  fehlgeschlagen_am TIMESTAMPTZ NULL,
  fehlgeschlagen_grund TEXT NULL,
  stripe_payment_intent_id TEXT NULL,
  email_log_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gutachter_id, abrechnungsmonat, abrechnungsjahr)
);
CREATE INDEX IF NOT EXISTS idx_abrechnungen_status ON abrechnungen(status);
CREATE INDEX IF NOT EXISTS idx_abrechnungen_faellig ON abrechnungen(faelligkeitsdatum);

-- Abrechnung-Positionen
CREATE TABLE IF NOT EXISTS abrechnung_positionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abrechnung_id UUID NOT NULL REFERENCES abrechnungen(id) ON DELETE CASCADE,
  fall_id UUID NOT NULL REFERENCES faelle(id),
  fall_datum DATE NOT NULL,
  kennzeichen TEXT NULL,
  schadenhoehe_netto NUMERIC(10,2) NOT NULL,
  lead_preis_netto NUMERIC(10,2) NOT NULL,
  lead_preis_typ TEXT NOT NULL CHECK (lead_preis_typ IN ('paket','einzel')),
  guthaben_verrechnet_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  sv_nachzahlung_netto NUMERIC(10,2) NOT NULL DEFAULT 0,
  position_nr INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_abrechnung_pos_abrechnung ON abrechnung_positionen(abrechnung_id);

-- Abrechnung-Reminders
CREATE TABLE IF NOT EXISTS abrechnung_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abrechnung_id UUID NOT NULL REFERENCES abrechnungen(id) ON DELETE CASCADE,
  reminder_typ TEXT NOT NULL CHECK (reminder_typ IN ('reminder_5d','reminder_10d','reminder_13d','einzug_versucht','einzug_fehlgeschlagen','gesperrt')),
  versendet_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_abrechnung_reminders_unique ON abrechnung_reminders(abrechnung_id, reminder_typ);

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('abrechnungen', 'abrechnungen', false) ON CONFLICT DO NOTHING;
