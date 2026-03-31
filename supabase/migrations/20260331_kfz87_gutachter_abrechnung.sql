-- KFZ-87: Gutachter Abrechnung
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS leadpreis DECIMAL(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS leadpreis_typ TEXT;

CREATE TABLE IF NOT EXISTS gutachter_monatsabrechnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID NOT NULL REFERENCES sachverstaendige(id),
  monat DATE NOT NULL, faelle_im_paket INTEGER DEFAULT 0, faelle_einzel INTEGER DEFAULT 0,
  summe_paket DECIMAL(10,2) DEFAULT 0, summe_einzel DECIMAL(10,2) DEFAULT 0,
  gesamtbetrag DECIMAL(10,2) DEFAULT 0, status TEXT DEFAULT 'offen',
  faellig_am DATE, bezahlt_am DATE, erstellt_am TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gutachter_abrechnungspositionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abrechnung_id UUID REFERENCES gutachter_monatsabrechnungen(id),
  fall_id UUID REFERENCES faelle(id), kunde_name TEXT, kennzeichen TEXT,
  schadenshoehe DECIMAL(10,2), leadpreis DECIMAL(10,2), leadpreis_typ TEXT,
  termin_datum DATE, erstellt_am TIMESTAMPTZ DEFAULT now()
);
