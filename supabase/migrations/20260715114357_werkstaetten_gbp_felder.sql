-- GBP (Google Business Profile) fuer den Werkstatt-Trust-Chip (Werkstatt-Finder-Embed #18).
-- Pattern gespiegelt von sachverstaendige.standort_place_id + GoogleBusinessFeld. Rating gecacht
-- (kein Live-Fetch pro Finder-Render); Refresh in der Datenpflege / periodisch. Additiv, nullable.
ALTER TABLE public.werkstaetten
  ADD COLUMN IF NOT EXISTS google_place_id     text,
  ADD COLUMN IF NOT EXISTS google_rating       numeric(2,1),
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_rating_am    timestamptz;
