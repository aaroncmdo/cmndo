-- Evergreen-Autopilot: erlaube quelle='ai_gap' auf wissen_artikel (KI-autonome Evergreen-Artikel).
-- Additiv (nur Ausweitung der erlaubten Menge) — sicher, kein Drop.
-- wissen_themen erlaubt 'ai_gap' bereits (dormanter Pfad der urspruenglichen AI-Redaktion).

ALTER TABLE public.wissen_artikel DROP CONSTRAINT wissen_artikel_quelle_check;
ALTER TABLE public.wissen_artikel ADD CONSTRAINT wissen_artikel_quelle_check
  CHECK (quelle = ANY (ARRAY['redaktion'::text, 'crawl'::text, 'ai_gap'::text]));
