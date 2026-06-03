-- AAR-939 Stream 8b: Monitoring-Spalten fuer den SV-Tracking-Webhook.
-- "Letzter Send"-Status (8b.6) auf embed_sites. RLS erbt die bestehende
-- owner_select-Policy (inhaber_profile_id = auth.uid()); Writes nur via
-- service_role (Sender / Test-Action).
ALTER TABLE public.embed_sites
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_status text,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_at     timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_error  text;

COMMENT ON COLUMN public.embed_sites.tracking_webhook_last_status IS 'AAR-939 8b: HTTP-Status des letzten Tracking-Webhook-Sends als Text (z.B. 200) bzw. timeout/error.';
