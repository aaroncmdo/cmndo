-- P0 Task 1: Freund-Graph netzwerk_verbindungen (profiles<->profiles) + View v_netzwerk_freunde.
-- Additiv. RLS: nur Beteiligte lesen/schreiben. View = Definer, service_role-only (Graph-Leak-Schutz, K1).
create table public.netzwerk_verbindungen (
  id             uuid primary key default gen_random_uuid(),
  anfrager_id    uuid not null references public.profiles(id) on delete cascade,
  empfaenger_id  uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'offen'
                   check (status in ('offen','angenommen','abgelehnt','blockiert')),
  erstellt_am    timestamptz not null default now(),
  beantwortet_am timestamptz,
  constraint netzwerk_verbindungen_kein_selbst check (anfrager_id <> empfaenger_id)
);
create unique index netzwerk_verbindungen_paar_uniq
  on public.netzwerk_verbindungen (least(anfrager_id, empfaenger_id), greatest(anfrager_id, empfaenger_id));
create index netzwerk_verbindungen_anfrager_idx  on public.netzwerk_verbindungen (anfrager_id, status);
create index netzwerk_verbindungen_empfaenger_idx on public.netzwerk_verbindungen (empfaenger_id, status);

alter table public.netzwerk_verbindungen enable row level security;
create policy netzwerk_verbindungen_select on public.netzwerk_verbindungen
  for select to authenticated using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
create policy netzwerk_verbindungen_insert on public.netzwerk_verbindungen
  for insert to authenticated with check (anfrager_id = auth.uid() and anfrager_id <> empfaenger_id);
create policy netzwerk_verbindungen_update on public.netzwerk_verbindungen
  for update to authenticated using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
grant select, insert, update on public.netzwerk_verbindungen to authenticated;

create view public.v_netzwerk_freunde as
  select anfrager_id  as profil_id, empfaenger_id as freund_id
    from public.netzwerk_verbindungen where status = 'angenommen'
  union all
  select empfaenger_id as profil_id, anfrager_id  as freund_id
    from public.netzwerk_verbindungen where status = 'angenommen';
revoke all on public.v_netzwerk_freunde from anon, authenticated;
grant select on public.v_netzwerk_freunde to service_role;
