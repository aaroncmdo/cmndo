-- Anon-Grant-Cap Runde 3d (Task D, FINALE): profiles OAuth-Token-Spalten - Column-Cap.
--
-- Kontext: systematischer Grant-Audit 15./16.07. (AGENTS.md Anon-Grant-Gate,
-- Baseline 4 -> 0): google_access_token, google_refresh_token, ms_access_token,
-- ms_refresh_token. CORE-Tabelle (59 Spalten), table-weiter anon-SELECT-Grant,
-- 0 anon-SELECT-Policies (staff_read_all ist {authenticated}-only) = latent.
--
-- Column-Cap statt Full-Revoke, weil benigne profiles-Spalten von anon-nahen
-- Kontexten explizit selektiert werden (Marketing/autounfall: rolle/id/vorname/
-- anzeigename/avatar_url/email/telefon) - die bleiben gegrantet.
--
-- Pflicht-Vorarbeit (alle Ergebnisse 16.07., staging + marketing + autounfall + kfz-cluster):
--   1. KEIN .select('*') und KEIN argumentloses .select() auf profiles (multiline-Grep
--      120- und 300-Zeichen-Fenster); KEIN profiles(*)-Star-Embed im ganzen Repo;
--      alle Embeds explizit benigne Spalten. kfz-gutachter-* lesen profiles gar nicht.
--   2. Realtime: profiles ist NICHT in der supabase_realtime-Publication + 0
--      postgres_changes-Subscriber im Code -> keine walrus/CDC-Flanke (die claims-
--      Regression 20260714220455 betraf den authenticated-Cap; hier NUR anon).
--   3. 6 Views referenzieren profiles - keine anon-selektierbar, keine beruehrt
--      OAuth-Spalten. 4 INVOKER-Funktionen mit anon-EXECUTE lesen nur rolle/email.
--      Edge Functions (elementor-lead-webhook) = SERVICE_ROLE_KEY.
--   4. authenticated bleibt KOMPLETT unberuehrt (OAuth-Token-Sichtbarkeit fuer
--      eingeloggte Fremd-User = separater Scope, siehe Audit-Doku).
--
-- Fail-closed: neue profiles-Spalten erben den anon-Grant NICHT (Column-Grants
-- erweitern sich nicht automatisch).

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('google_access_token','google_refresh_token','ms_access_token','ms_refresh_token');

  revoke select on public.profiles from anon;
  execute format('grant select (%s) on public.profiles to anon', v_cols);
end $$;

-- fail-closed Self-Verify: OAuth-Spalten dicht, benigne Kern-Spalten erhalten.
do $$
declare
  v_leak text[] := '{}';
  v_kaputt text[] := '{}';
  c text;
begin
  foreach c in array array['google_access_token','google_refresh_token','ms_access_token','ms_refresh_token'] loop
    if has_column_privilege('anon', 'public.profiles', c, 'SELECT') then
      v_leak := v_leak || c;
    end if;
  end loop;
  foreach c in array array['id','rolle','vorname','nachname','anzeigename','avatar_url','email','telefon'] loop
    if not has_column_privilege('anon', 'public.profiles', c, 'SELECT') then
      v_kaputt := v_kaputt || c;
    end if;
  end loop;
  if array_length(v_leak,1) is not null then
    raise exception 'FAIL-CLOSED: anon liest OAuth-Spalten weiterhin: %', v_leak;
  end if;
  if array_length(v_kaputt,1) is not null then
    raise exception 'FAIL-CLOSED: benigne profiles-Spalten fuer anon verloren: %', v_kaputt;
  end if;
  raise notice 'OK: profiles OAuth-Spalten fuer anon gesperrt, benigne erhalten.';
end $$;
