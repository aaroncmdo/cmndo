-- AAR-548 D5: schadenhergang vs. unfallhergang — KEIN Duplikat (Doc-only).
--
-- Daten-Check (14 Rows):
--   schadenhergang befüllt: 9
--   unfallhergang befüllt:  11
--   beide befüllt:          6
--   divergent:              6/6 (bei allen Rows mit beide-befüllt divergent)
--
-- Die beiden Felder decken 2 Prozess-Stufen ab:
--   1. schadenhergang  — User-Rohtext aus Schaden-Melden-Flow (Voice-Transcript,
--                        Text-Eingabe in Schritt 1). Often unstrukturiert.
--   2. unfallhergang   — Strukturierter Hergang mit Dispatch-Follow-Up-Q&A
--                        (Phase 1 Qualifizierung). Für SV-Briefing + Unfallskizze.
--
-- Code-Consumer klar getrennt:
--   schadenhergang → voice-transcribe, vision/lead-analyse, Phase4Stammdaten
--                    (Kunden-Rohtext-Pflicht ≥ 20 Zeichen)
--   unfallhergang  → Phase1Qualifizierung-Draft, briefing-prompt, UnfallskizzeCard,
--                    FlowWizardKfz, Phase5Zusammenfassung
--
-- Konsequenz: KEIN Drop — Dispatch-Qualifizierung würde brechen. Docs so dass
-- zukünftige Devs nicht fälschlich konsolidieren.

COMMENT ON COLUMN faelle.schadenhergang IS
  'Kunden-Rohtext aus Schaden-Melden-Flow (Voice-Transcript / Text-Eingabe Schritt 1). '
  'Kann unstrukturiert sein. Für Qualifizierung wird daraus unfallhergang abgeleitet/ergänzt.';

COMMENT ON COLUMN faelle.unfallhergang IS
  'Strukturierter Unfallhergang nach Dispatch-Qualifizierung (Phase 1 Follow-Up-Q&A). '
  'Source-of-Truth für SV-Briefing, Unfallskizze, Phase-5-Zusammenfassung. '
  'Ersetzt NICHT schadenhergang (der bleibt als Roh-Snapshot).';;
