-- CMM-32e: Granulare Dokument-Zurückweisung.
--
-- KB kann einzelne Dokumente flaggen statt pauschal alle zu markieren.
-- Kommentar pro Datei erklärt dem SV genau was korrigiert werden muss.
-- Ohne Auswahl bleibt abgelehnt_am NULL (kein Dokument wird versteckt).

ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS zurueckweisung_kommentar text;

COMMENT ON COLUMN public.fall_dokumente.zurueckweisung_kommentar IS
  'CMM-32e: Optionaler KB-Kommentar wenn dieses Dokument bei einer Zurückweisung explizit als fehlerhaft markiert wurde.';