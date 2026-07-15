-- Systematischer Grant-Audit — anon-SELECT auf leads KOMPLETT entziehen.
--
-- Befund: anon hatte einen table-weiten SELECT-Grant + ~200 explizite Spalten-Grants auf leads
-- (Name/Email/Telefon/halter_geburtsdatum/finanzierung_bank/gegner_*/ALLES). Die anon-Policy
-- leads__b1sel_an laesst `status='flow-gesendet'` durch -> WAERE die Policy nicht durch einen
-- Quirk (sachverstaendige-Join-Zweig, anon fehlt SELECT drauf) DENIED, koennte JEDER Anonyme die
-- komplette PII ALLER flow-gesendet-Leads per PostgREST lesen. Breites latentes PII-Leck.
--
-- Fix: anon-SELECT auf leads voll entziehen (table + alle Spalten). KEIN benigner Re-Grant —
-- anders als makler/werkstaetten hat leads KEINE Public-Landing; ALLE leads-Zugriffe laufen ueber
-- service_role/authenticated:
--   * Erstellung: createLead() via createAdminClient (schaden/[token], embed-Finder) — verifiziert.
--   * Lesen: /flow (createServiceClient/createAdminClient), embed (createAdminClient) — verifiziert.
--   * Browser-Clients auf leads: nur in authenticated Portalen (dispatch/faelle) — kein anon.
-- anon war ohnehin DENIED (Policy-Fehler) -> Revoke aendert kein funktionierendes Verhalten.
-- authenticated bleibt UNBERUEHRT (leads__b1sel_au + Grants).

do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema='public' and table_name='leads';

  execute 'revoke select on public.leads from anon';                       -- table-level
  execute format('revoke select (%s) on public.leads from anon', v_cols);  -- alle column-level
end $$;

-- fail-closed: anon liest KEINE sensible leads-Spalte mehr; authenticated unveraendert.
do $$
declare v_leak text[] := '{}'; c text;
begin
  foreach c in array array['halter_geburtsdatum','finanzierung_bank','telefon','email','vorname',
                           'nachname','gegner_name','gegner_telefon','id','status'] loop
    if has_column_privilege('anon', 'public.leads', c, 'SELECT') then
      v_leak := v_leak || c;
    end if;
  end loop;
  if array_length(v_leak,1) is not null then
    raise exception 'FAIL-CLOSED: anon liest weiterhin leads-Spalten: %', v_leak;
  end if;
  if not has_table_privilege('authenticated','public.leads','SELECT') then
    raise exception 'FAIL-CLOSED: authenticated hat leads-SELECT verloren — zu viel entzogen!';
  end if;
  raise notice 'OK: anon-SELECT auf leads komplett entzogen; authenticated intakt.';
end $$;
