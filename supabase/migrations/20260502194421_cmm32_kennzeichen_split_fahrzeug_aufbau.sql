-- CMM-32 Polish (Phase 2): Strukturierte Kennzeichen-Spalten + Fahrzeug-Aufbau.
--
-- Bisher liegt das Kennzeichen als ein einziger String auf leads.kennzeichen
-- und faelle.kennzeichen. Fuer den neuen Kennzeichenhalter im Kunde-Portal
-- brauchen wir die Bestandteile separat (Kreiskuerzel, Erkennungsbuchstaben,
-- Zahl, Suffix E/H) — und fuer die Aufbau-Anzeige (Limousine/Kombi/SUV/
-- Caravan/Oldtimer/...) eine neue Spalte.
--
-- Strategie:
--   1. Spalten anlegen (NULL erlaubt — kein NOT-NULL um den Backfill nicht
--      zu blockieren).
--   2. Backfill aus dem bestehenden `kennzeichen`-String per regex_match.
--   3. CHECK-Constraint fuer den Suffix (nur 'E' oder 'H').
--   4. Den alten `kennzeichen`-String NICHT loeschen — viele Stellen lesen
--      ihn noch (Stepper, OCR-Pipeline, Mitteilungs-Templates). Ein
--      kuenftiger Trigger (Phase 3) haelt beide Repraesentationen synchron.
--
-- Aufbau-Werte (text + CHECK statt enum, damit nachtraegliche Erweiterung
-- ohne Migration moeglich ist):
--   limousine, kombi, suv, coupe, cabrio, transporter, caravan, motorrad,
--   oldtimer, lkw, sonstiges

-- ─── leads ──────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS kennzeichen_kreis      text,
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben text,
  ADD COLUMN IF NOT EXISTS kennzeichen_zahl       text,
  ADD COLUMN IF NOT EXISTS kennzeichen_suffix     text,
  ADD COLUMN IF NOT EXISTS fahrzeug_aufbau        text;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_kennzeichen_suffix_chk;
ALTER TABLE leads
  ADD CONSTRAINT leads_kennzeichen_suffix_chk
  CHECK (kennzeichen_suffix IS NULL OR kennzeichen_suffix IN ('E', 'H'));

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_fahrzeug_aufbau_chk;
ALTER TABLE leads
  ADD CONSTRAINT leads_fahrzeug_aufbau_chk
  CHECK (
    fahrzeug_aufbau IS NULL OR fahrzeug_aufbau IN (
      'limousine', 'kombi', 'suv', 'coupe', 'cabrio', 'transporter',
      'caravan', 'motorrad', 'oldtimer', 'lkw', 'sonstiges'
    )
  );

-- ─── faelle ─────────────────────────────────────────────────────────────
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS kennzeichen_kreis      text,
  ADD COLUMN IF NOT EXISTS kennzeichen_buchstaben text,
  ADD COLUMN IF NOT EXISTS kennzeichen_zahl       text,
  ADD COLUMN IF NOT EXISTS kennzeichen_suffix     text,
  ADD COLUMN IF NOT EXISTS fahrzeug_aufbau        text;

ALTER TABLE faelle
  DROP CONSTRAINT IF EXISTS faelle_kennzeichen_suffix_chk;
ALTER TABLE faelle
  ADD CONSTRAINT faelle_kennzeichen_suffix_chk
  CHECK (kennzeichen_suffix IS NULL OR kennzeichen_suffix IN ('E', 'H'));

ALTER TABLE faelle
  DROP CONSTRAINT IF EXISTS faelle_fahrzeug_aufbau_chk;
ALTER TABLE faelle
  ADD CONSTRAINT faelle_fahrzeug_aufbau_chk
  CHECK (
    fahrzeug_aufbau IS NULL OR fahrzeug_aufbau IN (
      'limousine', 'kombi', 'suv', 'coupe', 'cabrio', 'transporter',
      'caravan', 'motorrad', 'oldtimer', 'lkw', 'sonstiges'
    )
  );

-- ─── Backfill leads ─────────────────────────────────────────────────────
-- Regex: ^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$
-- Gruppen: 1=Kreis, 2=Buchstaben, 3=Zahl, 4=Suffix optional
UPDATE leads SET
  kennzeichen_kreis      = m[1],
  kennzeichen_buchstaben = m[2],
  kennzeichen_zahl       = m[3],
  kennzeichen_suffix     = NULLIF(m[4], '')
FROM (
  SELECT id, regexp_match(
    upper(regexp_replace(kennzeichen, '\s+', ' ', 'g')),
    '^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$'
  ) AS m
  FROM leads
  WHERE kennzeichen IS NOT NULL
    AND kennzeichen_kreis IS NULL
) AS sub
WHERE leads.id = sub.id
  AND sub.m IS NOT NULL;

-- ─── Backfill faelle ────────────────────────────────────────────────────
UPDATE faelle SET
  kennzeichen_kreis      = m[1],
  kennzeichen_buchstaben = m[2],
  kennzeichen_zahl       = m[3],
  kennzeichen_suffix     = NULLIF(m[4], '')
FROM (
  SELECT id, regexp_match(
    upper(regexp_replace(kennzeichen, '\s+', ' ', 'g')),
    '^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$'
  ) AS m
  FROM faelle
  WHERE kennzeichen IS NOT NULL
    AND kennzeichen_kreis IS NULL
) AS sub
WHERE faelle.id = sub.id
  AND sub.m IS NOT NULL;

-- ─── Indices ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_kennzeichen_kreis_buchst
  ON leads (kennzeichen_kreis, kennzeichen_buchstaben);
CREATE INDEX IF NOT EXISTS idx_faelle_kennzeichen_kreis_buchst
  ON faelle (kennzeichen_kreis, kennzeichen_buchstaben);

-- ─── Kommentare zur Dokumentation ──────────────────────────────────────
COMMENT ON COLUMN leads.kennzeichen_kreis      IS 'Stadt-/Kreis-Kuerzel, 1-3 Buchstaben (z.B. "K", "AS", "MK")';
COMMENT ON COLUMN leads.kennzeichen_buchstaben IS 'Erkennungsbuchstaben, 1-2 (z.B. "AS", "B")';
COMMENT ON COLUMN leads.kennzeichen_zahl       IS 'Erkennungszahl, 1-4 Ziffern (text wegen evtl. fuehrender Nullen)';
COMMENT ON COLUMN leads.kennzeichen_suffix     IS 'Optional: E (Elektro), H (Oldtimer)';
COMMENT ON COLUMN leads.fahrzeug_aufbau        IS 'limousine | kombi | suv | coupe | cabrio | transporter | caravan | motorrad | oldtimer | lkw | sonstiges';

COMMENT ON COLUMN faelle.kennzeichen_kreis      IS 'Stadt-/Kreis-Kuerzel, 1-3 Buchstaben (z.B. "K", "AS", "MK")';
COMMENT ON COLUMN faelle.kennzeichen_buchstaben IS 'Erkennungsbuchstaben, 1-2 (z.B. "AS", "B")';
COMMENT ON COLUMN faelle.kennzeichen_zahl       IS 'Erkennungszahl, 1-4 Ziffern (text wegen evtl. fuehrender Nullen)';
COMMENT ON COLUMN faelle.kennzeichen_suffix     IS 'Optional: E (Elektro), H (Oldtimer)';
COMMENT ON COLUMN faelle.fahrzeug_aufbau        IS 'limousine | kombi | suv | coupe | cabrio | transporter | caravan | motorrad | oldtimer | lkw | sonstiges';
