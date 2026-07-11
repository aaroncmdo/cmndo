alter table public.werkstaetten
  add column if not exists verifiziert boolean not null default false,
  add column if not exists verifiziert_am timestamptz,
  add column if not exists verifiziert_von uuid,
  add column if not exists verifizierung_notiz text;

comment on column public.werkstaetten.verifiziert is 'Admin-verifizierte Werkstatt (Trust-Marker + Vorreihung im Finder, Inc 3)';
