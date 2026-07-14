-- Claims-Spalten-Exposure Schicht 2/2: Tabellen-GRANT-Cap.
--
-- Befund: `authenticated` hatte einen TABELLEN-WEITEN SELECT-Grant auf claims (196 Spalten).
-- Zusammen mit der RLS-Policy claims__b1sel_au (die u.a. geschaedigter_user_id = auth.uid(),
-- sv_id, is_claim_user_party() und is_kanzlei() durchlaesst) konnte damit JEDE Nicht-Staff-
-- Rolle mit Zeilen-Sicht auf ihren Fall die internen Spalten per PostgREST direkt auslesen —
-- z.B. `GET /rest/v1/claims?select=interne_notizen,lead_preis_netto` mit dem eigenen JWT.
-- Die View-Maskierung (Schicht 1, Mig 20260714215721) schuetzt hier NICHT: sie greift nur,
-- wenn durch v_claim_base gelesen wird, nicht bei Direkt-Reads auf die Tabelle.
--
-- Fix: table-weites SELECT entziehen, Spalten-Allowlist granten (alle AUSSER den 9 internen).
-- anon hat auf claims ohnehin KEIN SELECT (geprueft) -> nichts zu tun.
--
-- Consumer-Audit vorab (alle User-Client-Reads auf claims): 0x select('*') (der einzige
-- select('*') — load-needed-phases.ts:68 — laeuft ueber createAdminClient/service_role und
-- bypasst Grants). Die beiden User-Client-Leser interner Spalten (gutachter/abrechnung
-- = SV-eigener Leadpreis, admin LeadPreiseVerteilungWidget) wurden im selben PR auf
-- service_role umgestellt (harden-then-flip). Writes sind unberuehrt: die claims-.update()
-- haengen kein .select() an, und UPDATE ... WHERE id=? braucht nur SELECT auf id +
-- kundenbetreuer_id (beide in der Allowlist).
--
-- ACHTUNG Drift: Eine NEUE claims-Spalte bekommt hierdurch KEINEN Grant automatisch —
-- sie waere fuer User-Clients unsichtbar (stiller PostgREST-Fehler). Dagegen laeuft der
-- Ratchet `npm run check:claims-column-grants` (scripts/check-claims-column-grants.mjs):
-- er blockt jede claims-Spalte, die weder gegrantet noch als intern deklariert ist.

do $$
declare
  v_cols     text;
  v_fehlend  text[];
  v_gesperrt text[] := array[
    'notizen','interne_notizen','marketing_provision','lead_preis_netto','lead_preis_typ',
    'lead_preis_berechnet_am','kanzlei_honorar','kanzlei_provision_status','kanzlei_provision_ausgezahlt_am'
  ];
begin
  -- fail-closed 1: jede zu sperrende Spalte muss existieren (faengt Tippfehler/Schema-Drift)
  select array_agg(s) into v_fehlend
  from unnest(v_gesperrt) s
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='claims' and column_name = s
  );
  if v_fehlend is not null then
    raise exception 'FAIL-CLOSED: diese Spalten existieren nicht auf claims: % — Migration abgebrochen.', v_fehlend;
  end if;

  -- Allowlist = alle Spalten ausser den gesperrten (generiert, keine 187-Spalten-Liste im SQL)
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema='public' and table_name='claims'
    and not (column_name = any(v_gesperrt));

  execute 'revoke select on public.claims from authenticated';
  execute format('grant select (%s) on public.claims to authenticated', v_cols);
end $$;

-- fail-closed 2: Selbst-Verifikation via has_column_privilege (autoritativ)
do $$
declare
  v_leak    text[];
  v_kaputt  text[];
  v_gesperrt text[] := array[
    'notizen','interne_notizen','marketing_provision','lead_preis_netto','lead_preis_typ',
    'lead_preis_berechnet_am','kanzlei_honorar','kanzlei_provision_status','kanzlei_provision_ausgezahlt_am'
  ];
begin
  -- (a) keine der 9 darf fuer authenticated/anon noch lesbar sein
  select array_agg(distinct c.column_name) into v_leak
  from information_schema.columns c, unnest(array['authenticated','anon']) r
  where c.table_schema='public' and c.table_name='claims'
    and c.column_name = any(v_gesperrt)
    and has_column_privilege(r, 'public.claims', c.column_name, 'SELECT');
  if v_leak is not null then
    raise exception 'FAIL-CLOSED: diese internen Spalten sind weiterhin lesbar: %', v_leak;
  end if;

  -- (b) alle uebrigen Spalten MUESSEN lesbar bleiben (sonst haetten wir die App zerlegt)
  select array_agg(c.column_name) into v_kaputt
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='claims'
    and not (c.column_name = any(v_gesperrt))
    and not has_column_privilege('authenticated', 'public.claims', c.column_name, 'SELECT');
  if v_kaputt is not null then
    raise exception 'FAIL-CLOSED: diese unbedenklichen Spalten verloren den SELECT-Grant: %', v_kaputt;
  end if;

  raise notice 'OK: 9 interne Spalten gesperrt, alle uebrigen weiterhin lesbar.';
end $$;
