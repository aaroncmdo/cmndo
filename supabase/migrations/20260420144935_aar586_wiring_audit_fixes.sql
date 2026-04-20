-- AAR-586 Wiring-Audit: Findings 4 + 5 — Kommentar-Korrekturen
--
-- Finding 4: faelle.unfallhergang und faelle.schadens_hergang hatten lt. DB-Audit
-- identische Kommentare. Code-Verifikation zeigt: verschiedene Zwecke.
-- - unfallhergang: Wer hat was getan (Schuldfrage-Narrativ, Phase 1 Q1)
-- - schadens_hergang: Was ist am Fahrzeug passiert (AAR-305, Q8, nur Pflicht wenn fahrbereit)
--
-- Finding 5: halter_name auf faelle ist ein DEFAULT-berechnetes Feld.
-- Code-Verifikation: kein direktes Write gefunden — ZB1-Action schreibt nur
-- halter_vorname/halter_nachname. Kommentar explizit als Warnung dokumentiert.

COMMENT ON COLUMN faelle.schadens_hergang IS
  'AAR-305 Q8: Beschreibung des Fahrzeugschadens (was ist am Auto passiert). Pflichtfeld wenn fahrzeug_fahrbereit=true (mind. 20 Zeichen vor FlowLink-Versand). NICHT identisch mit unfallhergang — schadens_hergang beschreibt den Schaden am Fahrzeug, unfallhergang den Unfallablauf mit Schuldverteilung.';

COMMENT ON COLUMN faelle.unfallhergang IS
  'Phase-1-Q1: Narrativer Unfallhergang inkl. Schuldfrage-Kontext. Pflicht fuer Q1 der qualification-engine (zusammen mit schuldfrage-Feld). NICHT identisch mit schadens_hergang — unfallhergang beschreibt den Unfallablauf, schadens_hergang den resultierenden Fahrzeugschaden (AAR-305).';

COMMENT ON COLUMN faelle.halter_name IS
  'AAR-548 D7: Computed-default aus halter_vorname || halter_nachname. NICHT direkt beschreiben — stattdessen halter_vorname und halter_nachname setzen. Direktes INSERT/UPDATE auf halter_name fuehrt zu Constraint-Error oder wird ignoriert.';
