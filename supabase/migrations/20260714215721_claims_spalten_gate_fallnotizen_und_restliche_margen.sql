-- Claims-Spalten-Exposure Schicht 1/2: View-Maskierung vervollstaendigen.
--
-- Befund (14.07.): v_claim_base maskiert bereits 3 sensible Spalten per
-- CASE WHEN rolle_sieht_margen() (kanzlei_honorar, marketing_provision, lead_preis_netto)
-- — analog zu rolle_sieht_bankdaten() (iban/bic/kontoinhaber/geburtsdatum) und
-- rolle_sieht_regulierung(). SECHS weitere interne Spalten laufen jedoch ROH durch:
--   notizen, interne_notizen, lead_preis_typ, lead_preis_berechnet_am,
--   kanzlei_provision_status, kanzlei_provision_ausgezahlt_am
-- Da v_claim_base SECURITY DEFINER ist und v_claim_full / v_faelle_mit_aktuellem_termin /
-- faelle_kunde_view / faelle_sv_view daraus lesen (authenticated hat SELECT-Grant), sieht
-- jede Rolle mit Zeilen-Sicht auf den Claim (Kunde, SV, Kanzlei, claim_party) diese Werte.
--
-- Gate-Wahl (Aaron-Entscheid 14.07.):
--   notizen + interne_notizen  -> NEU rolle_sieht_fallnotizen() = Staff + KANZLEI
--       (Kanzlei bearbeitet den Fall und soll die Notizen behalten; sie gehen zusaetzlich
--        ins Kanzlei-Paket. Kunde/SV/Makler/Werkstatt sehen sie nicht mehr.)
--   lead_preis_typ/-berechnet_am + kanzlei_provision_* -> rolle_sieht_margen() = Staff
--
-- Schicht 2/2 (Tabellen-GRANT-Cap auf claims) folgt in einer eigenen Migration — die View-
-- Maskierung allein schuetzt NICHT vor Direkt-Reads auf die Tabelle via PostgREST.

-- 1) Gate-Funktion: Staff + Kanzlei (Muster 1:1 von rolle_sieht_margen uebernommen).
create or replace function public.rolle_sieht_fallnotizen()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.role() = 'service_role'
      or exists (
        select 1 from profiles
        where id = (select auth.uid())
          and rolle in ('admin','kundenbetreuer','dispatch','kanzlei')
      );
$function$;

comment on function public.rolle_sieht_fallnotizen() is
  'Gate fuer Fall-Notizen (claims.notizen/interne_notizen) in v_claim_base: Staff + Kanzlei. Pendant zu rolle_sieht_margen()/rolle_sieht_bankdaten().';

-- 2) v_claim_base: die 6 roh durchlaufenden Spalten maskieren.
--    Verbatim-viewdef + gezielte Ersetzung + FAIL-CLOSED (jedes Muster muss genau 1x treffen).
--    Die aeussere SELECT-Liste ist mit 4 Spaces eingerueckt ("\n    sub.x,"), der innere
--    Sub-Select mit 12 ("\n            c.x,") -> die Muster sind eindeutig.
do $$
declare
  v_def    text;
  v_needle text;
  v_repl   text;
  v_cnt    int;
  i        int;
  v_pairs  text[] := array[
    E'\n    sub.notizen,',
    E'\n    CASE WHEN rolle_sieht_fallnotizen() THEN sub.notizen ELSE NULL::text END AS notizen,',
    E'\n    sub.interne_notizen,',
    E'\n    CASE WHEN rolle_sieht_fallnotizen() THEN sub.interne_notizen ELSE NULL::text END AS interne_notizen,',
    E'\n    sub.lead_preis_typ,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.lead_preis_typ ELSE NULL::text END AS lead_preis_typ,',
    E'\n    sub.lead_preis_berechnet_am,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.lead_preis_berechnet_am ELSE NULL::timestamptz END AS lead_preis_berechnet_am,',
    E'\n    sub.kanzlei_provision_status,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.kanzlei_provision_status ELSE NULL::text END AS kanzlei_provision_status,',
    E'\n    sub.kanzlei_provision_ausgezahlt_am,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.kanzlei_provision_ausgezahlt_am ELSE NULL::timestamptz END AS kanzlei_provision_ausgezahlt_am,'
  ];
begin
  v_def := pg_get_viewdef('public.v_claim_base'::regclass, true);

  for i in 1 .. array_length(v_pairs, 1) by 2 loop
    v_needle := v_pairs[i];
    v_repl   := v_pairs[i + 1];
    v_cnt := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
    if v_cnt <> 1 then
      raise exception 'FAIL-CLOSED: Muster "%" kam %x vor (erwartet exakt 1x). v_claim_base-Struktur weicht ab — Migration abgebrochen, keine Aenderung.', v_needle, v_cnt;
    end if;
    v_def := replace(v_def, v_needle, v_repl);
  end loop;

  execute 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || v_def;
end $$;

-- 3) Selbst-Verifikation: alle 9 sensiblen Spalten muessen jetzt gegatet sein.
do $$
declare
  v_def     text;
  v_ungated text[] := '{}';
  c         text;
begin
  v_def := pg_get_viewdef('public.v_claim_base'::regclass, true);
  foreach c in array array[
    'notizen','interne_notizen','marketing_provision','lead_preis_netto','lead_preis_typ',
    'lead_preis_berechnet_am','kanzlei_honorar','kanzlei_provision_status','kanzlei_provision_ausgezahlt_am'
  ] loop
    -- gegatet == es gibt KEIN rohes "\n    sub.<spalte>," mehr in der aeusseren Liste
    if position(E'\n    sub.' || c || ',' in v_def) > 0 then
      v_ungated := v_ungated || c;
    end if;
  end loop;
  if array_length(v_ungated, 1) is not null then
    raise exception 'FAIL-CLOSED: diese Spalten laufen weiterhin ROH durch v_claim_base: %', v_ungated;
  end if;
  raise notice 'OK: alle 9 sensiblen claims-Spalten sind in v_claim_base gegatet.';
end $$;
