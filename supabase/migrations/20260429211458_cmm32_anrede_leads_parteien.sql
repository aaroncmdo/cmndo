-- CMM-32: Anrede-Spalte auf leads + parteien.
-- Werte: 'herr' | 'frau' | 'divers' (text, gleicher Stil wie profiles.anrede).
-- Nullable, weil Bestandsdaten keinen Wert haben und der Dispatcher das Feld
-- beim Erstkontakt (Telefon) erfassen muss — wenn unbekannt, bleibt's null
-- und die Templates fallen auf "Hallo Vorname Nachname" zurück.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS anrede text
  CHECK (anrede IS NULL OR anrede IN ('herr', 'frau', 'divers'));

ALTER TABLE public.parteien
  ADD COLUMN IF NOT EXISTS anrede text
  CHECK (anrede IS NULL OR anrede IN ('herr', 'frau', 'divers'));

COMMENT ON COLUMN public.leads.anrede IS
  'CMM-32: Anrede des Geschaedigten (herr/frau/divers). Wird beim Konvertieren auf parteien.anrede vererbt.';
COMMENT ON COLUMN public.parteien.anrede IS
  'CMM-32: Anrede der Partei (geschaedigter/schaediger/zeuge usw.). Quelle fuer WhatsApp/Email-Templates.';
