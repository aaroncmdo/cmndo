-- KFZ-92: Paket-Upgrades Tabelle
CREATE TABLE IF NOT EXISTS paket_upgrades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_id UUID NOT NULL REFERENCES sachverstaendige(id),
  altes_paket TEXT NOT NULL, neues_paket TEXT NOT NULL,
  differenz_anzahlung DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'angefragt', angefragt_am TIMESTAMPTZ DEFAULT now(),
  bezahlt_am DATE, aktiviert_am DATE
);
