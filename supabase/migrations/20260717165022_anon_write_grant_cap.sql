-- anon-Write-Grant-Cap (Defense-in-Depth, 17.07.2026).
-- Fund (read-only Audit): anon hat table-weite INSERT/UPDATE/DELETE auf 150/202 public-Tabellen
-- (Supabase Default-Privilege-Wurzel). ALLE sind RLS-gegated (0 RLS-disabled -> kein AKTIVES Loch),
-- und die ~90 anon-Write-Policies sind bis auf EINE alle auth.uid()/Rollen-gegated (nur authenticated
-- kommt durch; ein echter anon faellt durch). Einziger true-anon-Write: gutachter_finder_anfragen
-- (b1ins source IS NULL = nativer Finder-Submit + b1upd_an source-NULL-Draft-Zweig).
-- => Grant kappen ist reine Defense-in-Depth (kein Verhaltens-Change, RLS blockte eh), schuetzt aber
-- gegen eine kuenftige versehentliche permissive anon-Write-Policy. Paart mit der Default-Privilege-
-- Wurzel (Aaron): dieser Sweep raeumt den Bestand, die Wurzel verhindert Neue.
-- REVOKE trifft NUR anon; authenticated-Writes (die eigentlichen Policy-Nutzer) unberuehrt.
-- lock_timeout niedrig: 150 Tabellen inkl. heisser (claims/profiles) -> nie Prod blockieren.
--
-- Regel-4-Smoke (prod, role-sim): anon-Finder-INSERT (source NULL) NICHT permission-denied (Submit
-- intakt); anon-INSERT auf claims/profiles = 42501 (Cap wirkt). has_table_privilege: anon-Write
-- 150->1 Tabelle (nur gutachter_finder_anfragen ins/upd).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke insert, update, delete, truncate on all tables in schema public from anon;
grant insert, update on public.gutachter_finder_anfragen to anon;

do $$
begin
  if has_table_privilege('anon','public.claims','INSERT') then
    raise exception 'FAIL: anon hat noch INSERT auf claims';
  end if;
  if has_table_privilege('anon','public.profiles','UPDATE') then
    raise exception 'FAIL: anon hat noch UPDATE auf profiles';
  end if;
  if not has_table_privilege('anon','public.gutachter_finder_anfragen','INSERT') then
    raise exception 'FAIL: anon INSERT auf gutachter_finder_anfragen fehlt (Finder-Submit gebrochen)';
  end if;
  if not has_table_privilege('anon','public.gutachter_finder_anfragen','UPDATE') then
    raise exception 'FAIL: anon UPDATE auf gutachter_finder_anfragen fehlt (Finder-Draft gebrochen)';
  end if;
  raise notice 'OK: anon-Write auf public gekappt (Keep: gutachter_finder_anfragen ins/upd).';
end $$;
