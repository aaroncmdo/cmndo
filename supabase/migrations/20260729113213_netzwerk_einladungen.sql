-- P1 T4: Kalt-Einladung. Airdrop-Token (Hash+Prefix). Einlader liest eigene; Writes nur service_role (Admin-Client).
create table public.netzwerk_einladungen (
  id                   uuid primary key default gen_random_uuid(),
  einlader_id          uuid not null references public.profiles(id) on delete cascade,
  email                text not null,
  ziel_rolle           text not null check (ziel_rolle in ('sachverstaendiger','werkstatt','makler')),
  token_hash           text not null unique,
  token_lookup_prefix  varchar(8) not null,
  status               text not null default 'offen' check (status in ('offen','eingeloest','abgelaufen')),
  erstellt_am          timestamptz not null default now(),
  ablauf_am            timestamptz not null default (now() + interval '30 days'),
  eingeloest_am        timestamptz,
  eingeloest_profil_id uuid references public.profiles(id)
);
create index netzwerk_einladungen_prefix_idx  on public.netzwerk_einladungen (token_lookup_prefix);
create index netzwerk_einladungen_einlader_idx on public.netzwerk_einladungen (einlader_id, status);

alter table public.netzwerk_einladungen enable row level security;
create policy netzwerk_einladungen_select_own on public.netzwerk_einladungen
  for select to authenticated using (einlader_id = auth.uid());
grant select on public.netzwerk_einladungen to authenticated;
