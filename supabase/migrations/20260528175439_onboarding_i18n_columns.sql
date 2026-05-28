-- Phase 2 / Track A: i18n-Overrides fuer Wizard-Config (onboarding_phasen/onboarding_felder).
-- Additiv, nullable. de bleibt in den Basis-Spalten (titel/label/...) = Fallback.
-- Loader liest i18n->>locale mit de-Fallback. Reine Daten-Spalte, RLS unveraendert (public-read deckt sie ab).
ALTER TABLE onboarding_phasen ADD COLUMN IF NOT EXISTS i18n jsonb;
ALTER TABLE onboarding_felder ADD COLUMN IF NOT EXISTS i18n jsonb;
COMMENT ON COLUMN onboarding_phasen.i18n IS 'i18n-Overrides je Locale: {"en":{"titel","eyebrow","beschreibung"},"tr":{...},...}. de bleibt in den Basis-Spalten (Fallback). Doc 48 Phase 2 Track A.';
COMMENT ON COLUMN onboarding_felder.i18n IS 'i18n-Overrides je Locale: {"en":{"label","hint","placeholder","optionen":{"<value>":"<label>"}},...}. de bleibt in den Basis-Spalten (Fallback). Doc 48 Phase 2 Track A.';
