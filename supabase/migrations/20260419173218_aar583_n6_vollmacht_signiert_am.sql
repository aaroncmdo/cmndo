-- AAR-583 (N6) — leads.vollmacht_unterschrieben (bool) → vollmacht_signiert_am (timestamptz).
--
-- Ziel: Konsistenz mit dem Pattern auf `faelle` (dort lebt seit AAR-227
-- `vollmacht_signiert_am` als Timestamp; Bool wird aus `IS NOT NULL` abgeleitet).
-- Der bool auf `leads` war die letzte Insel im „Vollmacht-Status als Bool"-Stil.
--
-- Spalte `vollmacht_datum` bleibt erhalten — das ist der vom Kunden in
-- Flow-Schritt-3 angegebene oder ausgewählte Signatur-Termin (relevant für
-- UI-Anzeige + Kanzlei-Abrechnung-Alignment). `vollmacht_signiert_am` ist der
-- Server-Timestamp wann die Unterschrift erfolgt ist.
--
-- Backfill-Strategie (Prio):
--   1. vollmacht_datum (explizites Signatur-Datum)
--   2. updated_at (zuletzt verändert ≈ wann signiert)
--   3. now() (harter Fallback, falls beides NULL)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS vollmacht_signiert_am timestamptz;

UPDATE leads
SET vollmacht_signiert_am = COALESCE(vollmacht_datum, updated_at, now())
WHERE vollmacht_unterschrieben = true AND vollmacht_signiert_am IS NULL;

ALTER TABLE leads DROP COLUMN IF EXISTS vollmacht_unterschrieben;
