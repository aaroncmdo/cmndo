-- AAR-665-follow: Separate DB-Spalte fahrzeugschaden_beschreibung für die
-- Dispatch-Phase-4-Frage „Was ist am Auto kaputt".
--
-- Kontext:
-- - leads.sachschaden_beschreibung / faelle.sachschaden_beschreibung wurde
--   bisher doppeldeutig verwendet: in Phase 1 für Drittschaden (Leitplanke,
--   iPhone des Beifahrers) UND in Phase 4 + Haiku-Vision-Pipeline für
--   Fahrzeugschaden (was am Auto kaputt ist).
-- - Semantik-Konflikt: Phase 4 überschreibt die Phase-1-Drittschaden-
--   Beschreibung + umgekehrt.
-- - Saubere Trennung: neue Spalte fahrzeugschaden_beschreibung für Phase 4.
-- - sachschaden_beschreibung bleibt ausschließlich Phase-1-Drittschaden.
--
-- Backfill: Fälle die bereits Haiku-Vision-Output in sachschaden_beschreibung
-- haben (wenn leads.schadensfoto_urls nicht leer ist), kopieren wir in die
-- neue Spalte. Drittschaden-Texte (ohne Fotos) bleiben wo sie sind.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fahrzeugschaden_beschreibung text;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS fahrzeugschaden_beschreibung text;

COMMENT ON COLUMN public.leads.fahrzeugschaden_beschreibung IS
  'AAR-665: Was ist am eigenen Fahrzeug kaputt. Wird in Phase 4 vom Dispatcher gepflegt oder automatisch von Claude-Haiku-Vision aus Unfallfotos gefüllt. Getrennt von sachschaden_beschreibung (Drittschaden in Phase 1, z.B. Leitplanke).';
COMMENT ON COLUMN public.faelle.fahrzeugschaden_beschreibung IS
  'AAR-665: Was ist am eigenen Fahrzeug kaputt. Kommt aus leads.fahrzeugschaden_beschreibung via convertLeadToFall.';

-- Backfill: Wenn ein Lead Unfallfotos hat, ist die sachschaden_beschreibung
-- mit sehr hoher Wahrscheinlichkeit der Haiku-Output (Fahrzeugschaden-Beschreibung).
-- In dem Fall kopieren wir sie in die neue Spalte + löschen sie aus der alten.
UPDATE public.leads
SET fahrzeugschaden_beschreibung = sachschaden_beschreibung,
    sachschaden_beschreibung = NULL
WHERE sachschaden_beschreibung IS NOT NULL
  AND jsonb_typeof(schadensfoto_urls) = 'array'
  AND jsonb_array_length(schadensfoto_urls) > 0;

-- Selbes Backfill auf faelle (für bereits konvertierte Fälle mit Foto-Daten)
UPDATE public.faelle f
SET fahrzeugschaden_beschreibung = f.sachschaden_beschreibung,
    sachschaden_beschreibung = NULL
FROM public.leads l
WHERE f.lead_id = l.id
  AND f.sachschaden_beschreibung IS NOT NULL
  AND jsonb_typeof(l.schadensfoto_urls) = 'array'
  AND jsonb_array_length(l.schadensfoto_urls) > 0;
