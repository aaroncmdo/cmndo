-- Makler aus dem Lead-Zweig von search_global entfernen.
-- Makler laufen ab jetzt ueber search_makler (consent-gegatet, id=fall_id -> /makler/akten).
-- In search_global bekaeme Makler nur Leads (via leads-RLS ueber promotion_code), die
-- routeForEntity nach /dispatch/leads/[id] schickt -> 403 fuer Makler. Also raus.
-- Sichere verbatim-Ersetzung (kein Hand-Reproduzieren der geteilten Funktion), fail-closed.

do $$
declare
  v_def    text;
  v_needle text := E',\'makler\']';   -- ...'leadbearbeiter','makler']  -> ...'leadbearbeiter']
  v_cnt    int;
begin
  v_def := pg_get_functiondef('public.search_global(text,integer)'::regprocedure);

  v_cnt := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
  if v_cnt <> 1 then
    raise exception 'FAIL-CLOSED: Muster % kam %x vor (erwartet 1). search_global-Struktur weicht ab — abgebrochen.', v_needle, v_cnt;
  end if;

  v_def := replace(v_def, v_needle, ']');
  execute v_def;
end $$;

-- Verifikation: makler ist raus, die anderen 4 Rollen sind noch drin.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.search_global(text,integer)'::regprocedure);
  if position('''makler''' in v_def) > 0 then
    raise exception 'FAIL-CLOSED: makler ist weiterhin in search_global referenziert.';
  end if;
  if position('''leadbearbeiter''' in v_def) = 0 then
    raise exception 'FAIL-CLOSED: leadbearbeiter fehlt jetzt — zu viel entfernt!';
  end if;
  raise notice 'OK: makler aus search_global-Lead-Gate entfernt, leadbearbeiter erhalten.';
end $$;
