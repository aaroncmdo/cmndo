-- partner_aktivitaeten: polymorpher Aktivitaets-/Event-Feed fuer alle Partner-Typen
-- (SV/Makler/Werkstatt/Flotte). Single-Source des Partner-Cockpits. Polymorph
-- (partner_typ + partner_id) statt 4 FK-Spalten; Integritaet per App-Write + RLS.
create table public.partner_aktivitaeten (
  id           uuid primary key default gen_random_uuid(),
  partner_typ  text not null check (partner_typ in ('sv','makler','werkstatt','flotte')),
  partner_id   uuid not null,
  typ          text not null check (typ in (
                 'anruf','notiz','email','einstufung','sonstiges',
                 'freigeschaltet','gesperrt','verifiziert','vertrag',
                 'lead_zugewiesen','provision','statuswechsel')),
  text         text not null,
  meta         jsonb,
  ist_system   boolean not null default false,
  erstellt_von uuid references public.profiles(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);

create index partner_aktivitaeten_partner_idx
  on public.partner_aktivitaeten (partner_typ, partner_id, erstellt_am desc);

alter table public.partner_aktivitaeten enable row level security;

-- Staff-Gate: admin/dispatch/leadbearbeiter — IDENTISCH zum erprobten
-- partner_lead_akt_staff_all. Bewusst NICHT is_staff() (= admin/kundenbetreuer/dispatch):
-- das enthaelt kundenbetreuer statt leadbearbeiter -> waere ein Mismatch zur Action-Gate
-- requireVertriebStaff (admin/dispatch/leadbearbeiter). Explizites TO authenticated
-- (RLS-Policy-Gate). Kein anon-Grant (Anon-Grant-Gate: 'text'/notiz = sensibel).
create policy partner_aktivitaeten_staff_all
  on public.partner_aktivitaeten
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role])
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'leadbearbeiter'::user_role])
    )
  );

grant select, insert, update, delete on public.partner_aktivitaeten to authenticated;

-- Einmal-Backfill: werkstatt_notizen -> partner_aktivitaeten. Gehaertet gegen
-- FK-Abbruch (orphan autor_user_id -> null) und NOT-NULL-Abbruch (werkstatt_id null -> skip).
-- Spalten prod-verifiziert 2026-08-04: werkstatt_id, autor_user_id, autor_name, text, created_at.
insert into public.partner_aktivitaeten
  (partner_typ, partner_id, typ, text, meta, ist_system, erstellt_von, erstellt_am)
select
  'werkstatt', wn.werkstatt_id, 'notiz', wn.text,
  case when wn.autor_name is not null then jsonb_build_object('autor_name', wn.autor_name) else null end,
  false,
  case when wn.autor_user_id is not null
         and exists (select 1 from public.profiles p2 where p2.id = wn.autor_user_id)
       then wn.autor_user_id else null end,
  wn.created_at
from public.werkstatt_notizen wn
where wn.text is not null and btrim(wn.text) <> '' and wn.werkstatt_id is not null;

comment on table public.werkstatt_notizen is
  'DEPRECATED (2026-08-04): nach partner_aktivitaeten migriert. Nicht droppen (Bestandsanzeige), keine neuen Writes.';
