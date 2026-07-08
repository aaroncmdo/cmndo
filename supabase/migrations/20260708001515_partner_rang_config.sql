create table if not exists public.partner_rang_config (
  schluessel text primary key,
  wert numeric not null,
  beschreibung text,
  updated_at timestamptz not null default now()
);

alter table public.partner_rang_config enable row level security;
-- Config wird nur vom Cron (service-role, bypasst RLS) gelesen. Kein public policy => nicht kundensichtbar.

insert into public.partner_rang_config (schluessel, wert, beschreibung) values
  ('volumen_faktor', 8, 'Volumen-Score = sqrt(volumen) * faktor'),
  ('cred_oeffentlich_bestellt', 20, 'Credential-Punkte fuer oeffentlich bestellt & vereidigt'),
  ('cred_pro_zertifikat', 6, 'Punkte je vorhandene Zertifikatsnummer (BVSK/DAT/IHK/OEBUV)'),
  ('cred_zertifikat_cap', 12, 'Cap fuer Zertifikat-Punkte'),
  ('cred_pro_jahr', 3, 'Punkte je Jahr Tenure (partner_seit)'),
  ('cred_tenure_cap', 8, 'Cap fuer Tenure-Punkte'),
  ('rating_min_bewertungen', 5, 'Mindest-Bewertungszahl damit Rating zaehlt'),
  ('rating_cap', 30, 'Cap fuer Rating-Punkte'),
  ('max_no_show_quote_gold', 0.08, 'Max No-Show-Quote fuer Gold-Gate'),
  ('max_no_show_quote_silber', 0.15, 'Max No-Show-Quote fuer Silber-Gate'),
  ('max_ablehnungen_30d', 8, 'Max ablehnungen_30_tage fuer Silber/Gold-Gate'),
  ('schwelle_silber', 35, 'Score-Schwelle Silber'),
  ('schwelle_gold', 60, 'Score-Schwelle Gold'),
  ('volumen_vielfach', 50, 'Volumen ab dem der Sinnsatz "vielfach begutachtet" nutzt'),
  ('volumen_erfahren', 15, 'Volumen ab dem der Sinnsatz "erfahrener Partner" nutzt')
on conflict (schluessel) do nothing;

comment on table public.partner_rang_config is 'DB-SSoT fuer Partner-Rang Gewichte/Caps/Schwellen (key-value). Vom Cron compute-partner-rang gelesen, live tunbar ohne Redeploy. Spec 2026-07-08-partner-tier-badge.';
