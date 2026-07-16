-- gutachter_termine Spalten-Auslagerung Schritt 1 (additiver Grundstein, 16.07.2026).
--
-- Zweck: honorar_betrag + notiz_intern aus gutachter_termine in eine Staff-only-Tabelle
-- verlagern, damit der Kunde (authenticated, is_claim_user_party) sie NICHT mehr lesen kann
-- (Fund: audit-authenticated-reachability-business-spalten). Ein View-Split war unzureichend,
-- weil der Kunde eine postgres_changes-Realtime-Subscription auf gutachter_termine hat
-- (TerminLiveStatus) und Views nicht subscribebar sind.
--
-- REIN ADDITIV: neue Tabelle + RLS + Backfill + Dual-Write-Trigger. Kein bestehender Code,
-- keine bestehende Spalte, keine bestehende Policy -> 0 Kollision mit aar-956. prod: 14
-- Termine, 0 mit honorar/notiz (dormant) -> Backfill leer.
--
-- ⚠ Supabase Default-Privileges granten anon+authenticated automatisch SELECT auf neue
-- Tabellen -> explizit revoken (sonst haette diese Staff-Tabelle einen anon-Grant, den der
-- Anon-Grant-Ratchet wegen 'honorar' im Namensmuster sofort flaggt).

create table public.gutachter_termine_intern (
  termin_id uuid primary key references public.gutachter_termine(id) on delete cascade,
  honorar_betrag numeric,
  notiz_intern text,
  updated_at timestamptz not null default now()
);

alter table public.gutachter_termine_intern enable row level security;

create or replace function public.can_read_gutachter_termin_intern(p_termin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from gutachter_termine gt
    where gt.id = p_termin_id
      and (
        ((select rolle from profiles where id = (select auth.uid())) = 'admin'::user_role)
        or ((gt.assignee_typ = 'sachverstaendiger') and (gt.assignee_id in (
              select id from sachverstaendige where profile_id = (select auth.uid()))))
        or ((gt.claim_id is not null and can_access_claim(gt.claim_id))
            or (gt.claim_id is null and exists (
                  select 1 from profiles where id = (select auth.uid())
                    and rolle = any (array['admin'::user_role, 'dispatch'::user_role]))))
        or ((gt.typ = 'kb_beratung') and ((gt.kb_id = (select auth.uid()))
            or ((gt.assignee_typ = 'kundenbetreuer') and (gt.assignee_id = (select auth.uid())))))
        or exists (
              select 1 from claims c join profiles p on p.id = (select auth.uid())
              where c.id = gt.claim_id and p.rolle = 'kanzlei'::user_role and c.service_typ = 'komplett')
      )
  );
$$;

grant execute on function public.can_read_gutachter_termin_intern(uuid) to authenticated;

create policy gti_select on public.gutachter_termine_intern
  for select to authenticated
  using (public.can_read_gutachter_termin_intern(termin_id));

-- Default-Privilege-Grants entziehen; authenticated nur SELECT (RLS filtert), anon nichts.
-- Writes laufen ueber service_role (Schritt 2 via createAdminClient) -> keine authenticated-Write-Policy.
revoke all on public.gutachter_termine_intern from anon;
revoke all on public.gutachter_termine_intern from authenticated;
grant select on public.gutachter_termine_intern to authenticated;

insert into public.gutachter_termine_intern (termin_id, honorar_betrag, notiz_intern)
  select id, honorar_betrag, notiz_intern
  from public.gutachter_termine
  where honorar_betrag is not null or notiz_intern is not null
  on conflict (termin_id) do update
    set honorar_betrag = excluded.honorar_betrag, notiz_intern = excluded.notiz_intern, updated_at = now();

create or replace function public.sync_gutachter_termin_intern()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gutachter_termine_intern (termin_id, honorar_betrag, notiz_intern, updated_at)
  values (new.id, new.honorar_betrag, new.notiz_intern, now())
  on conflict (termin_id) do update
    set honorar_betrag = excluded.honorar_betrag, notiz_intern = excluded.notiz_intern, updated_at = now();
  return new;
end;
$$;

create trigger trg_sync_gt_intern_ins
  after insert on public.gutachter_termine
  for each row
  when (new.honorar_betrag is not null or new.notiz_intern is not null)
  execute function public.sync_gutachter_termin_intern();

create trigger trg_sync_gt_intern_upd
  after update on public.gutachter_termine
  for each row
  when (old.honorar_betrag is distinct from new.honorar_betrag
        or old.notiz_intern is distinct from new.notiz_intern)
  execute function public.sync_gutachter_termin_intern();

do $$
begin
  if has_table_privilege('anon', 'public.gutachter_termine_intern', 'SELECT') then
    raise exception 'FAIL: anon hat SELECT auf gutachter_termine_intern';
  end if;
  if not has_table_privilege('authenticated', 'public.gutachter_termine_intern', 'SELECT') then
    raise exception 'FAIL: authenticated hat keinen SELECT-Grant';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.gutachter_termine_intern'::regclass) then
    raise exception 'FAIL: RLS nicht aktiviert';
  end if;
  raise notice 'OK: gutachter_termine_intern Grundstein (additiv, Staff-RLS, kein anon).';
end $$;
