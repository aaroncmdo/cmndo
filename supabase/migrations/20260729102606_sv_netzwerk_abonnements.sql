-- P0 Task 2: Entitlement-Subscription sv_netzwerk_abonnements (derive-at-read).
-- K1: SV liest eigene Zeile; KEIN authenticated-Write-Grant -> Writes nur service_role (Stripe-Webhook/Admin).
create table public.sv_netzwerk_abonnements (
  id                    uuid primary key default gen_random_uuid(),
  sv_id                 uuid not null references public.sachverstaendige(id) on delete cascade,
  status                text not null default 'inaktiv'
                          check (status in ('inaktiv','aktiv','ueberfaellig','gekuendigt','comped')),
  gueltig_bis           timestamptz,
  stripe_subscription_id text,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now()
);
create unique index sv_netzwerk_abo_sv_uniq on public.sv_netzwerk_abonnements (sv_id);
create index sv_netzwerk_abo_status_idx on public.sv_netzwerk_abonnements (status, gueltig_bis);

alter table public.sv_netzwerk_abonnements enable row level security;
create policy sv_netzwerk_abo_select_own on public.sv_netzwerk_abonnements
  for select to authenticated
  using (sv_id in (select s.id from public.sachverstaendige s where s.profile_id = auth.uid()));
grant select on public.sv_netzwerk_abonnements to authenticated;
