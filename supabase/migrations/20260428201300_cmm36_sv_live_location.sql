-- CMM-36: SV Live-Location für Geo-Tracking während aktiver Termine.
-- Nur eine Zeile pro SV (upsert by sv_id) — kein historisches Log, rein
-- zum Streamen. pg_cron löscht Einträge täglich um Mitternacht.
-- DSGVO-konform: keine Persistenz über den Arbeitstag hinaus.

CREATE TABLE sv_live_location (
  sv_id        uuid             PRIMARY KEY REFERENCES sachverstaendige(id) ON DELETE CASCADE,
  fall_id      uuid             REFERENCES faelle(id) ON DELETE SET NULL,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  accuracy     double precision,
  eta_minuten  integer,
  updated_at   timestamptz      NOT NULL DEFAULT now()
);

ALTER TABLE sv_live_location ENABLE ROW LEVEL SECURITY;

-- SV liest und schreibt nur seine eigene Zeile
CREATE POLICY "sv_live_location_own"
  ON sv_live_location
  FOR ALL
  USING (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
  );

-- Täglich Mitternacht: Einträge älter als 24h löschen
SELECT cron.schedule(
  'cmm36-sv-live-location-cleanup',
  '0 0 * * *',
  $$DELETE FROM sv_live_location WHERE updated_at < now() - interval '24 hours'$$
);
