-- AAR-939 · Monika-Embed — Per-SV Client-Side Conversion-Tracking
-- Additive Spalten fuer das client-seitige gtag (Google Ads Conversion-Action).
-- GA4 nutzt die bestehende tracking_ga4_measurement_id; hier die Ads-Seite:
--   send_to = tracking_gads_conversion_id "/" tracking_gads_conversion_label
-- Beide public-IDs (stehen in jedem gtag-Snippet) → kein Secret, kein RLS-Belang.

alter table public.embed_sites
  add column if not exists tracking_gads_conversion_id text,
  add column if not exists tracking_gads_conversion_label text;

comment on column public.embed_sites.tracking_gads_conversion_id is
  'AAR-939: Google Ads Conversion-ID (AW-XXXXXXXXX) fuer client-seitiges per-SV gtag. Public, kein Secret.';
comment on column public.embed_sites.tracking_gads_conversion_label is
  'AAR-939: Google Ads Conversion-Label. send_to = conversion_id/label.';
