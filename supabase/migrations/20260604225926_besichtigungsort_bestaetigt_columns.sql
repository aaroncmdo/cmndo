-- Fallback-Layer: getrackte Bestaetigung des Besichtigungsorts (Kunde/SV).
-- Auf gutachter_termine (= besichtigungsort-SSoT-Home), faelle-frei. Additiv, 0 Backfill.
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS besichtigungsort_bestaetigt_am timestamptz,
  ADD COLUMN IF NOT EXISTS besichtigungsort_bestaetigt_von text
    CHECK (besichtigungsort_bestaetigt_von IN ('kunde','sv'));
