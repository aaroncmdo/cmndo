-- AAR-939 Monika-A-Flow — 6 additive Diskriminator-Spalten auf gutachter_finder_anfragen.
-- Nullable + CHECK; jeder Pfad fuellt nur seine Felder. Value-neutral, kein Consumer bricht.
ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS anliegen text
    CHECK (anliegen IN ('schadensberatung','haftpflichtgutachten','wertgutachten','gegengutachten')),
  ADD COLUMN IF NOT EXISTS unfalltyp text
    CHECK (unfalltyp IN ('auffahrunfall','spurwechsel','vorfahrt','parken','sonstiges')),
  ADD COLUMN IF NOT EXISTS schuld_einschaetzung text
    CHECK (schuld_einschaetzung IN ('unverschuldet','nicht_sicher')),
  ADD COLUMN IF NOT EXISTS bewertungsgrund text
    CHECK (bewertungsgrund IN ('reparatur','verkauf')),
  ADD COLUMN IF NOT EXISTS wunsch_tag text
    CHECK (wunsch_tag IN ('morgen','uebermorgen','asap')),
  ADD COLUMN IF NOT EXISTS wunsch_zeit text
    CHECK (wunsch_zeit IN ('vormittag','nachmittag','abend'));
