-- AAR-549 S5: Anzahlung-Bezahlt-Am Konsolidierung auf sachverstaendige.
--
-- Vorher: zwei Spalten für denselben Zeitpunkt:
--   - anzahlung_bezahlt_am (DATE, aus KFZ-91 20260331)
--   - stripe_anzahlung_bezahlt_am (TIMESTAMPTZ, aus KFZ-148 20260408)
--
-- Nachher: nur noch stripe_anzahlung_bezahlt_am (höhere Präzision, autoritativ
-- seit Stripe-Webhook das Feld setzt).
--
-- Regel #14 Verification (Stand 2026-04-18):
--   - 4/4 SVs haben anzahlung_bezahlt_am IS NULL (altes Feld wurde NIE gesetzt)
--   - 1/4 SVs haben stripe_anzahlung_bezahlt_am gesetzt (produktiv)
--   - 0 divergente Rows
--
-- Code-Sweep:
--   - gutachter/abrechnung/page.tsx: Type-Feld + SELECT-String + Fallback auf
--     anzahlungBezahlt-Flag entfernt. stripe_anzahlung_bezahlt_am bleibt.
--   - database.types.ts: Row/Insert/Update-Einträge entfernt.

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS anzahlung_bezahlt_am;

COMMENT ON COLUMN sachverstaendige.stripe_anzahlung_bezahlt_am IS
  'Zeitpunkt der Anzahlung durch Stripe-Webhook bestätigt. Kanonische Quelle seit AAR-549 S5 (ersetzt anzahlung_bezahlt_am).';
