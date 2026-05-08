-- CMM-29: Google Places Foto-Referenz für Proxy-Endpoint.
-- photo_reference wird vom Cron-Job befüllt und serverseitig via
-- /api/place-photo?ref=<REF> ausgeliefert — API-Key bleibt server-side.
ALTER TABLE google_bewertungen_cache
  ADD COLUMN IF NOT EXISTS photo_reference text;
