ALTER TABLE public.fall_summaries
  ALTER COLUMN ai_modell SET DEFAULT 'claude-sonnet-4-6';

COMMENT ON COLUMN public.fall_summaries.ai_modell IS
  'Claude-Modell-String mit dem die Summary generiert wurde. Default seit AAR-437 claude-sonnet-4-6.';;
