-- KFZ-27: Finance Monatsberichte
CREATE TABLE IF NOT EXISTS finance_monatsberichte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monat TEXT NOT NULL,
  jahr INTEGER NOT NULL,
  -- Leads & Faelle
  neue_faelle INTEGER DEFAULT 0,
  aktive_faelle INTEGER DEFAULT 0,
  einzelabverkauf_faelle INTEGER DEFAULT 0,
  vollmacht_faelle INTEGER DEFAULT 0,
  aktive_vm_faelle INTEGER DEFAULT 0,
  leads_gesamt INTEGER DEFAULT 0,
  lead_conversion_rate DECIMAL(5,2) DEFAULT 0.60,
  vollmacht_quote DECIMAL(5,2) DEFAULT 0.60,
  -- Einnahmen
  delta_paket_einnahmen DECIMAL(10,2) DEFAULT 0,
  delta_einzel_einnahmen DECIMAL(10,2) DEFAULT 0,
  kanzlei_provision DECIMAL(10,2) DEFAULT 0,
  gesamt_einnahmen DECIMAL(10,2) DEFAULT 0,
  -- Kosten
  fixkosten DECIMAL(10,2) DEFAULT 0,
  betreuungskosten DECIMAL(10,2) DEFAULT 0,
  -- Ergebnis
  db_ii DECIMAL(10,2) DEFAULT 0,
  kum_db_ii DECIMAL(10,2) DEFAULT 0,
  -- Gewinnverteilung
  claimondo_gewinn_75 DECIMAL(10,2) DEFAULT 0,
  kanzlei_gewinn_25 DECIMAL(10,2) DEFAULT 0,
  -- Marketing (Maik)
  marketing_budget_netto DECIMAL(10,2) DEFAULT 0,
  marketing_budget_brutto DECIMAL(10,2) DEFAULT 0,
  maik_google_cpl DECIMAL(10,2) DEFAULT 0,
  maik_cpa_fix DECIMAL(10,2) DEFAULT 150,
  maik_provision DECIMAL(10,2) DEFAULT 0,
  -- Gutachter
  kontingent_gutachter INTEGER DEFAULT 0,
  gutachter_anzahlungen_gesamt DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(monat, jahr)
);

ALTER TABLE finance_monatsberichte ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access on finance_monatsberichte' AND tablename = 'finance_monatsberichte') THEN
    CREATE POLICY "Admins full access on finance_monatsberichte"
      ON finance_monatsberichte FOR ALL
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rolle = 'admin')
      );
  END IF;
END $$;
