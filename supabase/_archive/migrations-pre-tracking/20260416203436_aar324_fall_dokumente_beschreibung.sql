-- AAR-324 (Child 4 von AAR-320): Freitext-Beschreibung für Kunden-Uploads.
-- Nutzung:
--   1. Kunde lädt "Sonstiges"-Doc hoch → beschreibung = "Attest vom Hausarzt"
--      (Hilft dem KB beim Zuordnen — Child 6 / AAR-326 zeigt das im Modal)
--   2. Kunde lädt in einen Katalog-Slot hoch mit optionaler Notiz
-- NULL erlaubt, da die meisten SV/Admin-Uploads keine Beschreibung brauchen.
ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS beschreibung TEXT;

COMMENT ON COLUMN public.fall_dokumente.beschreibung IS
  'Freitext-Beschreibung des Kunden bei Onboarding-Upload (AAR-324). '
  'Wird im KB-Zuordnungs-Modal (AAR-326) als Kontext angezeigt.';;
