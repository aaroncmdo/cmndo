-- Z35 Ansprüche-Wahl im Gutachter-Finder Self-Dispatch-Flow:
--   vollstaendig  → Vollregulierung mit Anwalt (alle §249-Positionen)
--   nur_gutachten → Nur Gutachten, Kunde reguliert selbst
-- Wird beim Insert aus dem GutachterFinderClient gesetzt und vom Dispatch-
-- Portal genutzt um den Anwalts-Onboarding-Pfad zu triggern (oder eben nicht).

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS regulierungs_modus text
    CHECK (regulierungs_modus IN ('vollstaendig', 'nur_gutachten'));

COMMENT ON COLUMN public.gutachter_finder_anfragen.regulierungs_modus IS
  'Z35-Wahl: vollstaendig=Anwalt+alle Positionen, nur_gutachten=Selbst-Regulierung';
