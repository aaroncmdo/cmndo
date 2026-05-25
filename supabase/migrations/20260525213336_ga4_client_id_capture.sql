-- GA4 Measurement-Protocol: GA4 client_id (aus dem _ga-Cookie) speichern, damit
-- server-seitige Conversions (generate_lead / flowlink_sent / sa_signed) an die
-- echte Web-Session/den Ads-Klick attribuiert werden koennen.
--
-- Consent-respektierend: das Feld wird vom App-Code NUR gesetzt, wenn der User
-- Tracking-Consent erteilt hat. Vorhandene client_id == Consent war da.
--
-- Additiv + nullable + IF NOT EXISTS => metadata-only ALTER (kein Table-Rewrite),
-- idempotent, kollisionsfrei zu parallelen Migrationen.

alter table public.gutachter_finder_anfragen
  add column if not exists ga_client_id text;

alter table public.leads
  add column if not exists ga_client_id text;

comment on column public.gutachter_finder_anfragen.ga_client_id is
  'GA4 client_id (_ga-Cookie) fuer Measurement-Protocol-Attribution. Nur gesetzt bei erteiltem Tracking-Consent.';
comment on column public.leads.ga_client_id is
  'GA4 client_id (_ga-Cookie) fuer Measurement-Protocol-Attribution. Aus der Anfrage propagiert / beim Mini-Wizard-Submit gesetzt.';
