-- CMM-36: Geschätzte Fahrtzeit pro Termin als Baseline für die
-- Departure-Time-Berechnung. Wird einmalig beim Termin-Anlegen via
-- Mapbox Directions (SV-Standort → Schadens-Adresse) gefüllt.
--
-- Verwendung:
--   Banner "SV ist unterwegs" wird sichtbar ab (start_zeit - geschaetzte_fahrtzeit_min - buffer).
--   Wenn NULL (alte Termine, Mapbox-Call fehlgeschlagen) → Fallback 60 min.

ALTER TABLE gutachter_termine
  ADD COLUMN IF NOT EXISTS geschaetzte_fahrtzeit_min integer;

COMMENT ON COLUMN gutachter_termine.geschaetzte_fahrtzeit_min IS
  'CMM-36: Einmalig beim Anlegen via Mapbox berechnete Fahrtzeit von SV-Standort zur Schadens-Adresse. Baseline für Departure-Time-Heuristik.';
