-- Chat-System-Messages i18n (Phase 1): strukturierte Template-Parameter fuer
-- deterministische System-Nachrichten. template_key (existiert bereits) + dieses
-- template_params jsonb erlauben dem Display-Renderer, System-Messages in der
-- Leser-Sprache via next-intl t(key, params) zu rendern statt des rohen deutschen
-- nachricht-Texts (der als de-Fallback erhalten bleibt). Additiv + nullable.
ALTER TABLE public.nachrichten
  ADD COLUMN IF NOT EXISTS template_params jsonb;

COMMENT ON COLUMN public.nachrichten.template_params IS
  'i18n Phase 1: Parameter fuer template_key-basierte System-Message-Lokalisierung (next-intl). NULL fuer Nicht-Template-Nachrichten; nachricht bleibt de-Fallback.';
