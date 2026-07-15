-- Systematischer Grant-Audit — latente anon-Über-Grants kappen (Defense-in-Depth).
--
-- Befund: `anon` (voll oeffentlich) hatte einen TABLE-weiten SELECT-Grant auf 7 Tabellen mit
-- Bank-/Steuer-/Provisions-/PII-/interne-Notiz-Spalten. Heute latent (Zeilen-RLS zeigt anon 0
-- Zeilen bzw. DENIED), aber ein kuenftiger anon-erreichbarer Policy-Zweig (z.B. ein oeffentliches
-- Werkstatt-Listing) wuerde sonst IBANs/Provisionen/Geburtsdaten offenlegen.
--
-- Fix = Column-Cap wie bei claims: table-weites SELECT fuer anon entziehen, benigne Spalten
-- neu granten (sensible NICHT). Zero-risk: makler/werkstaetten haben Public-Landings
-- (/start/makler, /start/werkstatt, embed-Finder) die benigne Spalten (Name/Branding) lesen —
-- die bleiben. `authenticated` bleibt komplett UNBERUEHRT (per-Rolle-Grants).
--
-- BEWUSST AUSGENOMMEN: `leads` (halter_geburtsdatum/finanzierung_bank) — heisse Tabelle mit
-- /flow-Token-Flows als anon; separater Flow-Consumer-Check noetig (Audit-Marker).

do $$
declare
  rec record;
  v_cols text;
begin
  for rec in
    select * from (values
      ('werkstaetten',                array['bank_iban','bank_bic','bank_kontoinhaber','provision_aktiv','provision_betrag_netto','verifizierung_notiz']),
      ('makler',                      array['bank_iban','bank_bic','bank_kontoinhaber','provision_aktiv','provision_betrag_komplett_netto','provision_betrag_nur_gutachter_netto']),
      ('kanzleien',                   array['iban']),
      ('organisationen',              array['steuernummer']),
      ('auftraege',                   array['grundhonorar_brutto','grundhonorar_netto']),
      ('regulierungs_klassifizierung',array['notiz_intern']),
      ('personenschaden_personen',    array['geburtsdatum'])
    ) as t(tbl, sens)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into v_cols
    from information_schema.columns
    where table_schema='public' and table_name=rec.tbl
      and not (column_name = any(rec.sens));

    execute format('revoke select on public.%I from anon', rec.tbl);
    execute format('grant select (%s) on public.%I to anon', v_cols, rec.tbl);
  end loop;
end $$;

-- fail-closed: sensible Spalten fuer anon jetzt gesperrt, benigne (id) weiterhin lesbar.
do $$
declare
  v_leak text[] := '{}';
  v_kaputt text[] := '{}';
  v_paare text[][] := array[
    ['werkstaetten','bank_iban'],['werkstaetten','provision_betrag_netto'],['werkstaetten','verifizierung_notiz'],
    ['makler','bank_iban'],['makler','provision_betrag_komplett_netto'],
    ['kanzleien','iban'],['organisationen','steuernummer'],
    ['auftraege','grundhonorar_netto'],['regulierungs_klassifizierung','notiz_intern'],
    ['personenschaden_personen','geburtsdatum']
  ];
  v_tbls text[] := array['werkstaetten','makler','kanzleien','organisationen','auftraege','regulierungs_klassifizierung','personenschaden_personen'];
  i int;
begin
  for i in 1 .. array_length(v_paare,1) loop
    if has_column_privilege('anon', ('public.'||v_paare[i][1])::regclass, v_paare[i][2], 'SELECT') then
      v_leak := v_leak || (v_paare[i][1]||'.'||v_paare[i][2]);
    end if;
  end loop;
  -- benigne Gegenprobe: id muss lesbar bleiben
  for i in 1 .. array_length(v_tbls,1) loop
    if not has_column_privilege('anon', ('public.'||v_tbls[i])::regclass, 'id', 'SELECT') then
      v_kaputt := v_kaputt || v_tbls[i];
    end if;
  end loop;
  if array_length(v_leak,1) is not null then
    raise exception 'FAIL-CLOSED: anon liest sensible Spalten weiterhin: %', v_leak;
  end if;
  if array_length(v_kaputt,1) is not null then
    raise exception 'FAIL-CLOSED: benigne id-Spalte fuer anon verloren bei: %', v_kaputt;
  end if;
  raise notice 'OK: sensible anon-Grants entzogen, benigne erhalten.';
end $$;
