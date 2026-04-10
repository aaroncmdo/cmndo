-- KFZ-153: Statistik-Tab Rework
-- Neue Tabellen + Spalten fuer Kuerzungsgruende, Unfall-Konstellationen, Gegner-Daten, Branchen-Benchmarks
-- HINWEIS: versicherungs_konstellation + mithaftung_quote_prozent NICHT angelegt (Aaron-Praezisierung 09.04.2026)

-- ─── 1. Regulierungs-Klassifizierung ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regulierungs_klassifizierung (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id UUID NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  regulierungs_status TEXT NOT NULL CHECK (regulierungs_status IN (
    'voll_reguliert','teilweise_reguliert','abgelehnt','ausstehend'
  )),
  kuerzungsgrund TEXT NULL CHECK (kuerzungsgrund IN (
    'honorarkuerzung_pauschal',
    'mithaftung_kunde',
    'gutachten_formaler_mangel',
    'gutachten_inhaltlicher_mangel',
    'verspaetete_meldung',
    'bagatelle',
    'verweigerung_versicherer',
    'sonstiges'
  )),
  kuerzung_betrag_netto NUMERIC(10,2) NULL,
  reguliert_betrag_netto NUMERIC(10,2) NULL,
  geltend_gemacht_netto NUMERIC(10,2) NULL,
  versicherer TEXT NULL,
  begruendung_versicherer TEXT NULL,
  notiz_intern TEXT NULL,
  erfasst_von UUID NOT NULL REFERENCES auth.users(id),
  erfasst_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fall_id)
);

CREATE INDEX IF NOT EXISTS idx_regulierung_kuerzungsgrund
  ON regulierungs_klassifizierung(kuerzungsgrund)
  WHERE kuerzungsgrund IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_regulierung_status
  ON regulierungs_klassifizierung(regulierungs_status);

-- RLS
ALTER TABLE regulierungs_klassifizierung ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service-Role bypass regulierungs_klassifizierung"
  ON regulierungs_klassifizierung FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read regulierungs_klassifizierung"
  ON regulierungs_klassifizierung FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert regulierungs_klassifizierung"
  ON regulierungs_klassifizierung FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update regulierungs_klassifizierung"
  ON regulierungs_klassifizierung FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. Unfall-Konstellation auf faelle ────────────────────────────────────────

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS unfall_konstellation TEXT NULL;

DO $$ BEGIN
  ALTER TABLE faelle ADD CONSTRAINT check_unfall_konstellation
    CHECK (unfall_konstellation IS NULL OR unfall_konstellation IN (
      'auffahrunfall','spurwechsel','parkschaden','vorfahrt',
      'tueroeffnung','wildunfall','glatteis','sonstiges'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. Gegner-Daten auf faelle ───────────────────────────────────────────────

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gegner_anzahl_beteiligte INT NULL DEFAULT 1;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gegner_fahrzeugtyp TEXT NULL;

DO $$ BEGIN
  ALTER TABLE faelle ADD CONSTRAINT check_gegner_fahrzeugtyp
    CHECK (gegner_fahrzeugtyp IS NULL OR gegner_fahrzeugtyp IN (
      'pkw','lkw','transporter','motorrad','fahrrad','fussgaenger','bus','sonstiges'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_faelle_unfall_konst
  ON faelle(unfall_konstellation)
  WHERE unfall_konstellation IS NOT NULL;

-- ─── 4. Branchen-Benchmarks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branchen_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metrik TEXT NOT NULL UNIQUE,
  beschreibung TEXT NOT NULL,
  branchen_wert NUMERIC(10,2) NOT NULL,
  einheit TEXT NOT NULL,
  quelle TEXT NULL,
  gueltig_ab DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE branchen_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service-Role bypass branchen_benchmarks"
  ON branchen_benchmarks FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read branchen_benchmarks"
  ON branchen_benchmarks FOR SELECT
  TO authenticated USING (true);

-- Seed-Daten (BVSK/GDV-basierte Schaetzwerte)
-- ─── 5. FlowLink Felder auf leads ─────────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfall_konstellation TEXT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gegner_anzahl_beteiligte INT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gegner_fahrzeugtyp TEXT NULL;

-- ─── 6. Seed Branchen-Benchmarks ──────────────────────────────────────────────

INSERT INTO branchen_benchmarks (metrik, beschreibung, branchen_wert, einheit, quelle, gueltig_ab) VALUES
  ('avg_bearbeitungsdauer_tage', 'Durchschnittliche Bearbeitungsdauer vom Eingang bis Regulierung', 14.00, 'Tage', 'BVSK Honorarbefragung 2024/GDV', '2026-01-01'),
  ('avg_kuerzungsquote_prozent', 'Durchschnittlicher Anteil der Kuerzungen am Gesamtvolumen', 15.00, 'Prozent', 'GDV Schadensstatistik', '2026-01-01'),
  ('avg_schadenhoehe_eur', 'Durchschnittliche Schadenhoehe pro Fall', 4500.00, 'EUR', 'Allianz Schadenstudie 2024', '2026-01-01'),
  ('avg_gutachten_zeit_tage', 'Durchschnittliche Zeit vom SV-Zuweisen bis Gutachten-Eingang', 3.00, 'Tage', 'BVSK', '2026-01-01'),
  ('avg_anteil_klare_haftung_prozent', 'Anteil der Faelle mit klarer Haftung', 65.00, 'Prozent', 'GDV', '2026-01-01'),
  ('konversion_lead_zu_fall_prozent', 'Konversionsrate Lead zu Fall', 35.00, 'Prozent', 'Branchenschaetzung', '2026-01-01')
ON CONFLICT (metrik) DO NOTHING;
