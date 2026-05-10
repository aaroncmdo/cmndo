-- Onboarding-Foundation: Konfig-Tabellen für dynamischen Wizard.
--
-- Zwei Tabellen halten Phasen + Felder für alle Onboarding-Strecken
-- (gutachter-finden, sv-onboarding, mandantenfragebogen, kunde-onboarding).
-- Generischer DynamicWizard rendert nach typ und schreibt direkt in die
-- db_target-Spalten.
--
-- Plan: docs/plans/dynamic-onboarding-plan-2026-05-10.md

CREATE TABLE IF NOT EXISTS onboarding_phasen (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key        TEXT NOT NULL,
  reihenfolge     INT  NOT NULL,
  phase_key       TEXT NOT NULL,
  titel           TEXT NOT NULL,
  eyebrow         TEXT,
  beschreibung    TEXT,
  conditional_on  JSONB,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_phasen_flow_reihenfolge_uq UNIQUE (flow_key, reihenfolge),
  CONSTRAINT onboarding_phasen_flow_phasekey_uq    UNIQUE (flow_key, phase_key)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_phasen_flow ON onboarding_phasen (flow_key, reihenfolge);

COMMENT ON TABLE  onboarding_phasen IS 'Konfig-Tabelle: Phasen pro Onboarding-Flow für DynamicWizard.';
COMMENT ON COLUMN onboarding_phasen.flow_key       IS 'Logischer Flow-Identifier, z.B. gutachter-finden, sv-onboarding.';
COMMENT ON COLUMN onboarding_phasen.phase_key      IS 'Stable-key für eine Phase, wird im Wizard-State referenziert.';
COMMENT ON COLUMN onboarding_phasen.conditional_on IS 'Optional: Phase nur zeigen wenn Bedingung erfüllt — z.B. {"feld": "service_typ", "equals": "komplett"}.';

CREATE TABLE IF NOT EXISTS onboarding_felder (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id        UUID NOT NULL REFERENCES onboarding_phasen(id) ON DELETE CASCADE,
  reihenfolge     INT  NOT NULL,
  feld_key        TEXT NOT NULL,
  typ             TEXT NOT NULL CHECK (typ IN (
    'text', 'email', 'tel', 'number',
    'textarea', 'segmented', 'toggle-cards',
    'select', 'slot', 'signature', 'file', 'checkbox'
  )),
  label           TEXT NOT NULL,
  hint            TEXT,
  placeholder     TEXT,
  pflicht         BOOLEAN NOT NULL DEFAULT false,
  optionen        JSONB,
  validation      JSONB,
  db_target       JSONB NOT NULL,
  conditional_on  JSONB,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_felder_phase_feldkey_uq UNIQUE (phase_id, feld_key)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_felder_phase ON onboarding_felder (phase_id, reihenfolge);

COMMENT ON TABLE  onboarding_felder IS 'Konfig-Tabelle: Felder pro Phase. Wizard rendert nach typ und persistiert via db_target.';
COMMENT ON COLUMN onboarding_felder.typ            IS 'Field-Renderer-Typ — bestimmt welche React-Komponente gerendert wird.';
COMMENT ON COLUMN onboarding_felder.optionen      IS 'Für segmented/toggle-cards/select: Array [{value, label, icon?}].';
COMMENT ON COLUMN onboarding_felder.validation    IS 'Optional: {pattern, min, max, minLength, maxLength}.';
COMMENT ON COLUMN onboarding_felder.db_target     IS 'Zielspalte: {tabelle: "gutachter_finder_anfragen", spalte: "schuldfrage"}.';
COMMENT ON COLUMN onboarding_felder.conditional_on IS 'Optional: Feld nur zeigen wenn Bedingung erfüllt.';

-- RLS aktivieren — Konfig ist public-read (anon + authenticated dürfen lesen).
ALTER TABLE onboarding_phasen ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_felder ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_phasen_public_read ON onboarding_phasen
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY onboarding_felder_public_read ON onboarding_felder
  FOR SELECT TO anon, authenticated USING (true);

-- Writes nur via service_role (Admin-Tooling, Seed-Skripte). Keine
-- explizite INSERT/UPDATE/DELETE-Policy für anon/authenticated.

GRANT SELECT ON onboarding_phasen TO anon, authenticated;
GRANT SELECT ON onboarding_felder TO anon, authenticated;
