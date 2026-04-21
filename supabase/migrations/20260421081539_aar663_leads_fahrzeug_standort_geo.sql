-- AAR-663: Geo-Felder für Fahrzeug-Standort auf leads.
--
-- Schritt 1 des Self-Service-Flows bekommt ein Google-Places-Autocomplete-
-- Feld „Wo steht das Fahrzeug aktuell?". Damit findBestSV direkt nach
-- Lead-Anlage funktioniert (ohne Dispatcher-Phase-2-Geocoding), brauchen
-- wir die Koordinaten + place_id persistiert.
--
-- `fahrzeug_standort_adresse` existiert bereits (Textfeld), nur die
-- lat/lng/place_id-Trilogie kommt hinzu.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fahrzeug_standort_lat numeric,
  ADD COLUMN IF NOT EXISTS fahrzeug_standort_lng numeric,
  ADD COLUMN IF NOT EXISTS fahrzeug_standort_place_id text;
