-- Google-Ads-Sync (src/app/api/google-ads/sync/route.ts) schreibt diese 4 Spalten seit
-- Feature-Bau, sie existierten aber nie -> upsert scheiterte still (42703), Sync schrieb NIE.
-- Additiv, nullable -> kein Bestands-Impact.
ALTER TABLE public.finance_monatsberichte
  ADD COLUMN IF NOT EXISTS google_ads_kosten_eur numeric,
  ADD COLUMN IF NOT EXISTS google_ads_leads integer,
  ADD COLUMN IF NOT EXISTS google_ads_cpl_eur numeric,
  ADD COLUMN IF NOT EXISTS google_ads_sync_am timestamptz;
