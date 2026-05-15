-- AAR-437: fall_summaries.ai_modell Default aktualisieren von
-- 'claude-sonnet-4-5' auf 'claude-sonnet-4-6' (Sonnet 4.6 ist das aktuelle
-- Standard-Modell für Fall-Assistant-Aufrufe).
ALTER TABLE public.fall_summaries
  ALTER COLUMN ai_modell SET DEFAULT 'claude-sonnet-4-6';
COMMENT ON COLUMN public.fall_summaries.ai_modell IS
  'Claude-Modell für diese Zusammenfassung. Default claude-sonnet-4-6 (AAR-437).';;
