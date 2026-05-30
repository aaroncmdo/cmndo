-- Live-Drift: Code fragt sachverstaendige.stripe_einzug_fehlgeschlagen_am ab, Spalte fehlte.
-- Definition als naheliegende Annahme nach "_am"-Konvention (timestamptz, nullable).
alter table public.sachverstaendige
  add column if not exists stripe_einzug_fehlgeschlagen_am timestamptz;

comment on column public.sachverstaendige.stripe_einzug_fehlgeschlagen_am is
  'Zeitpunkt eines fehlgeschlagenen Stripe-Einzugs. Nachgezogen 2026-05-29 wegen Live-Drift (fehlende Migration). Typ als naheliegende Annahme - bei Original-Migration im Repo ggf. angleichen.';
