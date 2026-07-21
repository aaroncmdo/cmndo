-- Kanzlei-Mandantentrennung (Fix zu AUDIT-kanzlei-cross-tenant-scoping-2026-07-19).
-- VORHER: `rolle='kanzlei'` las ALLE kanzlei_faelle + ALLE claims mit service_typ='komplett'
-- (bare Rollen-Check, KEIN per-Kanzlei-Scoping — es existierte gar kein Mechanismus: keine
-- kanzlei-Entity, profiles ohne kanzlei_id, kanzlei_faelle.kanzlei_id NULL). Latent (aktuell
-- genau EINE Kanzlei, Testdaten-Vorstufe), scharf ab der 2. Kanzlei.
--
-- Diese Migration baut den Mechanismus und scopet die 2 Policies darauf — VERHALTENSNEUTRAL:
-- alle Bestands-Claims, die 2 kanzlei_faelle und die 2 kanzlei-User werden der einen Kanzlei
-- zugeordnet -> sie sehen exakt dasselbe wie vorher (kanban/mandate listen weiter alle
-- komplett-Claims). Ab der 2. Kanzlei greift die Isolation.
set local lock_timeout = '5s';

-- 1) Kanzlei-Entity (fehlte komplett; kanzlei_faelle.kanzlei_id zeigte ins Leere)
create table if not exists public.kanzlei (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  erstellt_am timestamptz not null default now()
);
alter table public.kanzlei enable row level security;
grant select on public.kanzlei to authenticated;

-- 2) Die eine (Test-)Kanzlei anlegen — idempotent/replay-safe
insert into public.kanzlei (name)
select 'Test Kanzlei'
where not exists (select 1 from public.kanzlei);

-- 3) User -> Kanzlei-Link
alter table public.profiles add column if not exists kanzlei_id uuid references public.kanzlei(id);

-- 4) Scoping-Helper. SECURITY DEFINER -> liest profiles ohne RLS-Rekursion.
create or replace function public.is_kanzlei_member(p_kanzlei_id uuid)
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select p_kanzlei_id is not null and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.kanzlei_id = p_kanzlei_id
  );
$function$;
revoke execute on function public.is_kanzlei_member(uuid) from public, anon;
grant execute on function public.is_kanzlei_member(uuid) to authenticated, service_role;

-- 5) Single-Tenant-Bruecke: solange es GENAU EINE Kanzlei gibt, bekommen neue Claims sie
--    automatisch. Ab der 2. Kanzlei liefert die Funktion NULL -> fail-closed, erzwingt die
--    explizite Zuordnung im Handover-Code (selbst-dokumentierender Umstellungspunkt).
create or replace function public.default_kanzlei_id()
returns uuid language sql stable
set search_path to 'pg_catalog', 'public'
as $function$
  select case when (select count(*) from public.kanzlei) = 1
              then (select id from public.kanzlei)
              else null end;
$function$;

-- 6) Claim -> Kanzlei-Zuordnung. Spalte OHNE Default anlegen (kein Table-Rewrite auf der
--    heissen claims-Tabelle), Default erst danach setzen (gilt nur fuer neue Inserts).
alter table public.claims add column if not exists kanzlei_id uuid references public.kanzlei(id);
alter table public.claims alter column kanzlei_id set default public.default_kanzlei_id();

-- 7) Backfill — idempotent, auf leerer DB (Replay) ein No-op
update public.profiles set kanzlei_id = (select id from public.kanzlei limit 1)
 where rolle = 'kanzlei'::user_role and kanzlei_id is null;
update public.claims set kanzlei_id = (select id from public.kanzlei limit 1)
 where kanzlei_id is null;
update public.kanzlei_faelle set kanzlei_id = (select id from public.kanzlei limit 1)
 where kanzlei_id is null;

-- 8) RLS auf der neuen Entity: Staff + eigene Mitglieder duerfen lesen
drop policy if exists kanzlei_sel_au on public.kanzlei;
create policy kanzlei_sel_au on public.kanzlei
  for select to authenticated
  using (
    (exists (select 1 from public.profiles p
              where p.id = (select auth.uid())
                and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))
    or public.is_kanzlei_member(id)
  );

-- 9) kanzlei_faelle: den bare kanzlei-Rollen-Zweig member-scopen (der redundante 4. Zweig
--    admin/KB war eine Teilmenge des 1. -> entfaellt, semantisch no-op)
alter policy kanzlei_faelle__b1sel on public.kanzlei_faelle
  using (
    (exists (select 1 from public.profiles p
              where p.id = (select auth.uid())
                and p.rolle = any (array['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role])))
    or (exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.rolle = 'kanzlei'::user_role)
        and public.is_kanzlei_member(kanzlei_id))
    or ((claim_id is not null) and public.is_claim_user_party(claim_id))
    or public.is_sv_for_claim(claim_id)
  );

-- 10) claims: den kanzlei-Zweig zusaetzlich auf die eigene Kanzlei scopen. Alle anderen
--     Zweige (admin / KB / dispatcher / geschaedigter / claim-party / SV) unveraendert.
alter policy claims__b1sel_au on public.claims
  using (
    (select public.is_admin())
    or ((select public.is_kundenbetreuer()) and ((kundenbetreuer_id = (select auth.uid())) or (kundenbetreuer_id is null)))
    or (((select public.is_dispatcher()) and public.dispatcher_owns_lead(lead_id))
        or (geschaedigter_user_id = (select auth.uid()))
        or public.is_claim_user_party(id))
    or (sv_id in (select s.id from public.sachverstaendige s where s.profile_id = (select auth.uid())))
    or ((select public.is_kanzlei()) and service_typ = 'komplett'::text and public.is_kanzlei_member(kanzlei_id))
  );
