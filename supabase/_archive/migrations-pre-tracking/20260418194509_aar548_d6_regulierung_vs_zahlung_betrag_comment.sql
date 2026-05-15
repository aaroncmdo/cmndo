-- AAR-548 D6: regulierung_betrag vs. zahlung_betrag — KEIN Duplikat (Doc-only).
--
-- Daten-Check: 0/14 Rows befüllt (noch keine realen Zahlungen).
--
-- Semantik:
--   regulierung_betrag — VS → Kanzlei. Anerkannter Schadenbetrag durch
--                         gegnerische Versicherung. Kann gekürzt sein (vs_kuerzung_grund,
--                         kuerzungs_betrag). Gefüllt bei VS-Reaktion.
--   zahlung_betrag     — Kanzlei → Kunde. Auszahlung nach Abzug Kanzlei-Honorar
--                         (kanzlei_honorar) und ggf. gutachter_honorar. Gefüllt
--                         wenn zahlung_eingegangen_am bei Kunde eintrifft.
--
-- Beispiel-Rechnung:
--   regulierung_betrag = 8.000 € (VS zahlt der Kanzlei)
--   - kanzlei_honorar    1.200 €
--   - gutachter_honorar    800 € (falls noch offen)
--   = zahlung_betrag     6.000 € (Auszahlung an Kunde)
--
-- Code-Consumer:
--   regulierung_betrag → vs-regulierung-actions (VS-Reaktion erfassen),
--                         admin/finance (Umsatz/Provision = regulierung_betrag * 0.1),
--                         prozess/AuszahlungSection (Anzeige)
--   zahlung_betrag     → vs-regulierung-actions (Zahlung-eingegangen-Step),
--                         prozess/AuszahlungSection (Anzeige Kunde-Betrag)
--
-- Konsequenz: KEIN Drop — zwei verschiedene Zahlungsströme der Regulierungskette.

COMMENT ON COLUMN faelle.regulierung_betrag IS
  'VS → Kanzlei: Betrag den die gegnerische Versicherung anerkennt + überweist. '
  'Finance-Umsatz-Basis für Provisionsberechnung. Kann gekürzt sein (kuerzungs_betrag).';

COMMENT ON COLUMN faelle.zahlung_betrag IS
  'Kanzlei → Kunde: Auszahlung an Kunden nach Abzug Kanzlei-Honorar + ggf. '
  'gutachter_honorar. Gefüllt wenn zahlung_eingegangen_am beim Kunden eintrifft. '
  'Ersetzt NICHT regulierung_betrag (das ist der VS-Betrag, zahlung ist Netto-Kunde).';;
