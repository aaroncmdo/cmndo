-- Unfall-Vor-Ort-Aufnahme Stufe 1 (Web-MVP, ohne NFC).
-- Aaron-Briefing 10.05.2026: Routing-Frage am Funnel-Anfang
-- ('Sind Sie am Unfallort?'). JA-Pfad fuehrt in Foto-Wizard mit
-- GPS-Stempel + Zeit-Stempel statt klassischem Termin-Pfad.
--
-- Felder auf gutachter_finder_anfragen damit ein Lead beide Pfade
-- decken kann (am_unfallort_flag=true → Sofortaufnahme, false →
-- klassischer Termin-Flow). Dispatch sieht in Mitteilung sofort wer
-- Soforthilfe braucht.

ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS am_unfallort_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aufnahme_fotos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aufgenommen_am timestamptz;

COMMENT ON COLUMN public.gutachter_finder_anfragen.am_unfallort_flag IS
  'Aaron 10.05.: User hat im Routing-Step "ja, am Unfallort" geklickt — Soforthilfe-Pfad statt klassischer Termin-Buchung';
COMMENT ON COLUMN public.gutachter_finder_anfragen.aufnahme_fotos IS
  'Array aus Storage-URLs der vor Ort aufgenommenen Fotos (Übersicht / Schaden nah / Kennzeichen / Umfeld)';
COMMENT ON COLUMN public.gutachter_finder_anfragen.aufgenommen_am IS
  'Zeitpunkt der Foto-Aufnahme — kombiniert mit schadenort_lat/lng als Beweismittel';
