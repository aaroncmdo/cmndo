-- Portal-i18n Welle 1 (F-40): On-Demand-Falldaten-MT-Cache.
-- Content-adressiert: Schluessel (source_hash, target_locale). source_hash = sha256(Originaltext).
-- Auto-Invalidierung bei Edit (neuer Text -> neuer Hash).
-- Zugriff NUR via service-role im Server-Action (CONTEXT B6) — KEINE Client-Policies.
-- Appliziert via Supabase-Plugin apply_migration am 2026-05-29 (AGENTS.md Regel 2).
-- Getrackte Version: 20260529152943 (Dateiname == Version, Twin-Drift-Schutz).
CREATE TABLE IF NOT EXISTS public.content_translations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash    text NOT NULL,
  target_locale  text NOT NULL CHECK (target_locale IN ('de','en','tr','ar','ru','pl')),
  translated_text text NOT NULL,
  provider       text NOT NULL DEFAULT 'anthropic',
  model          text,
  source_table   text,
  source_id      text,
  field          text,
  erstellt_am    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_translations_unique UNIQUE (source_hash, target_locale)
);

CREATE INDEX IF NOT EXISTS content_translations_lookup_idx
  ON public.content_translations (source_hash, target_locale);

-- RLS an, aber bewusst KEINE Policies -> kein direkter Client-Zugriff (B6).
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.content_translations IS
  'Content-adressierter MT-Cache fuer Falldaten (Anzeige-Hilfe). Original bleibt SSoT, nie rechtsverbindlich. Zugriff nur via service-role. Siehe _specs/portal-i18n CONTEXT B1/B6.';
