-- CMM-29: Google Places Integration — Datenbasis
--
-- 1. google_place_id auf profiles (für SVs, manuell gepflegt im Admin)
-- 2. google_bewertungen_cache — gecachte Bewertungsdaten (täglich via Cron aktualisiert)
--    Kein Live-Abruf bei Seitenaufruf — ausschließlich aus Cache lesen.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_place_id text;

CREATE TABLE IF NOT EXISTS google_bewertungen_cache (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  durchschnitt            numeric(3,1),
  anzahl_bewertungen      int,
  zuletzt_aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS google_bewertungen_cache_profile_id_idx
  ON google_bewertungen_cache (profile_id);

-- RLS: Lesen für alle eingeloggten Rollen; Schreiben nur service_role (Cron).
ALTER TABLE google_bewertungen_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_bewertungen_cache_select" ON google_bewertungen_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- google_review_prompt_gezeigt_am: einmalige Anzeige des Bewertungs-Prompts
-- im Kunden-Portal nach abgeschlossenem Termin (CMM-43).
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS google_review_prompt_gezeigt_am timestamptz;
