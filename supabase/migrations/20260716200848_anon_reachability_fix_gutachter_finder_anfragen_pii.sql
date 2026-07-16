-- Reachability-Fix: aktives anon-PII-Leck auf gutachter_finder_anfragen schliessen.
--
-- Fund 16.07. (systematische Reachability-Enumeration nach dem R3-Grant-Cap):
-- gutachter_finder_anfragen (PII: vorname/nachname/email/telefon/kennzeichen/schadenort)
-- hatte einen table-weiten anon-SELECT-Grant PLUS die anon-Policy
-- gutachter_finder_anfragen__b1sel_an mit qual
--   ((source IS NULL) AND (erstellt_am > now() - '00:05:00')) OR (admin-EXISTS auth.uid())
-- Der erste OR-Zweig ist NICHT auth.uid()-gated -> jeder true-anon (public anon-Key,
-- PostgREST GET) konnte die PII JEDER nativen Finder-Anfrage der letzten 5 Minuten
-- lesen (intermittierend aktiv, kein latenter Grant). DSGVO-relevant.
--
-- Anders als die 24 R3-Gaps (alle latent) war dies AKTIV. Der Spalten-Namen-Ratchet
-- (audit_anon_sensitive_grants) fing es strukturell nie (telefon/email nicht im Muster).
--
-- Consumer-Audit 16.07. (staging dc376c389, src + claimondo-marketing): 0 anon/Browser-
-- Reads. Alle .from('gutachter_finder_anfragen')-Sites = createAdminClient/service_role/
-- DEFINER (onboarding/slots, termine/actions, flow/[token], api/v1/melde-schaden,
-- embed/gutachter-finder/actions, werkstatt/kva, health, tracking-webhook, billing,
-- start-link/flowlink). Der Embed-Wizard hat keinen createBrowserClient. Die Policy
-- b1sel_an ist ein Relikt aus einer frueheren Version -> Full-Revoke + Policy-Drop safe.
--
-- Reachability-Enumeration (ganze anon-SELECT-Policy-Menge, prod): gutachter_finder_anfragen
-- ist das EINZIGE echte PII-Leck. Alle uebrigen anon-Policies sind entweder auth.uid()/
-- is_staff()/is_admin()-gated (latent) oder gewollt public (Referenz-Config,
-- Community-Feature, wissen_artikel, partner_rang - kein Kontakt-PII, verifiziert).
--
-- authenticated-Policy b1sel_au (sv_embed/admin/dispatch) bleibt UNBERUEHRT.

-- 1) Table-weiten anon-SELECT-Grant entziehen (kein anon-Consumer).
revoke select on public.gutachter_finder_anfragen from anon;

-- 2) Die leaky anon-Policy droppen (Defense-in-Depth: solange sie existiert, wuerde ein
--    versehentliches Re-Grant das Leck sofort reoeffnen). Nur die anon-Policy; die
--    authenticated-Policy _b1sel_au bleibt.
drop policy if exists gutachter_finder_anfragen__b1sel_an on public.gutachter_finder_anfragen;

-- 3) v_offene_anfragen (security_invoker ueber gfa) - anon-Grant entziehen. Nach (1)+(2)
--    ist die View fuer anon ohnehin dicht (invoker prueft gfa-RLS mit anon-Rechten);
--    der Grant-Entzug ist Defense-in-Depth (0 anon-Consumer).
revoke select on public.v_offene_anfragen from anon;

-- fail-closed Self-Verify.
do $$
begin
  if has_table_privilege('anon', 'public.gutachter_finder_anfragen', 'SELECT') then
    raise exception 'FAIL-CLOSED: anon hat weiterhin SELECT auf gutachter_finder_anfragen';
  end if;
  if has_table_privilege('anon', 'public.v_offene_anfragen', 'SELECT') then
    raise exception 'FAIL-CLOSED: anon hat weiterhin SELECT auf v_offene_anfragen';
  end if;
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'gutachter_finder_anfragen' and p.polname = 'gutachter_finder_anfragen__b1sel_an'
  ) then
    raise exception 'FAIL-CLOSED: leaky anon-Policy b1sel_an existiert noch';
  end if;
  -- authenticated-Grant + authenticated-Policy muessen bleiben.
  if not has_table_privilege('authenticated', 'public.gutachter_finder_anfragen', 'SELECT') then
    raise exception 'REGRESSION: authenticated-SELECT auf gutachter_finder_anfragen verloren';
  end if;
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'gutachter_finder_anfragen' and p.polname = 'gutachter_finder_anfragen__b1sel_au'
  ) then
    raise exception 'REGRESSION: authenticated-Policy b1sel_au verloren';
  end if;
  raise notice 'OK: anon-PII-Leck geschlossen, authenticated-Pfad intakt.';
end $$;
