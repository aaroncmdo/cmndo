ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS sv_briefing_text text NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_generated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_model text NULL,
  ADD COLUMN IF NOT EXISTS sv_briefing_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.faelle.sv_briefing_text IS 'AAR-377: AI-generiertes Briefing für den SV vor Vor-Ort-Termin. 3-5 Sätze, Claude Sonnet 4.6.';
COMMENT ON COLUMN public.faelle.sv_briefing_generated_at IS 'AAR-377: Zeitpunkt der letzten Briefing-Generierung.';
COMMENT ON COLUMN public.faelle.sv_briefing_model IS 'AAR-377: Verwendetes Claude-Modell (Debug/Audit).';
COMMENT ON COLUMN public.faelle.sv_briefing_version IS 'AAR-377: Counter für manuelle Regenerierungen. 0 = noch nicht generiert, 1 = automatisch bei Lead→Fall, >1 = manuell via Regenerate-Button.';;
