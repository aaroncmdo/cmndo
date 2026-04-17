-- AAR-377 (Blocker AAR-373): DB-Felder für AI-generiertes SV-Briefing.
--
-- Das Briefing ist ein 3-5-Satz-Zusammenfassung der Fall-Situation, das der
-- Sachverständige vor dem Vor-Ort-Termin liest. Generiert via Anthropic API
-- aus bereits erfassten Lead/Fall-Feldern (schadenhergang, flags,
-- interne_notizen etc.) — der Dispatcher bekommt keine neue manuelle Spalte.
--
-- Felder:
--   sv_briefing_text         — generierter Text (3-5 Sätze)
--   sv_briefing_generated_at — Zeitpunkt der Generierung
--   sv_briefing_model        — verwendetes Claude-Modell (Debugging/Audit)
--   sv_briefing_version      — Counter für manuelle Regenerierungen (startet 1)
--
-- Kein Versioning mit History-Tabelle (bewusst einfach gehalten) — Timeline-
-- Einträge „Briefing generiert" dokumentieren den Verlauf.

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS sv_briefing_text text NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_generated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_model text NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.faelle.sv_briefing_text IS
  'AAR-377: AI-generiertes Briefing für den SV vor Vor-Ort-Termin. 3-5 Sätze, Claude Sonnet 4.6.';
COMMENT ON COLUMN public.faelle.sv_briefing_generated_at IS
  'AAR-377: Zeitpunkt der letzten Briefing-Generierung.';
COMMENT ON COLUMN public.faelle.sv_briefing_model IS
  'AAR-377: Verwendetes Claude-Modell (Debug/Audit).';
COMMENT ON COLUMN public.faelle.sv_briefing_version IS
  'AAR-377: Counter für manuelle Regenerierungen. 0 = noch nicht generiert, 1 = automatisch bei Lead→Fall, >1 = manuell via Regenerate-Button.';
