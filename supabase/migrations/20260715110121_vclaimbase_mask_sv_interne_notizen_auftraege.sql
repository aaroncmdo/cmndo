-- auftraege-Exposure Schicht 1/2 (View-Pfad): SV-interne Notizen in v_claim_base maskieren.
--
-- Befund (15.07., ultrathink-Deep-Audit): auftraege.sv_notizen_vor_ort / filmcheck_notizen /
-- technische_stellungnahme_notiz_sv laufen via cur_auftrag durch v_claim_base ->
-- v_faelle_mit_aktuellem_termin (DEFINER, authenticated). Ein Kunde (claim_party) kann sie fuer
-- den eigenen Fall per PostgREST lesen (GET /v_faelle_mit_aktuellem_termin?select=sv_notizen_vor_ort).
-- Diese Felder sind SV-INTERN (On-Site-Notizen, Filmcheck-QC, techn. Stellungnahme-Notiz).
--
-- Gate = rolle_sieht_margen() (admin/kundenbetreuer/dispatch). Sicher als Staff-Gate, weil KEINE
-- SV-/Kunde-facing View diese 3 Spalten exponiert (faelle_sv_view/faelle_kunde_view/v_claim_sv/
-- v_werkstatt_auftrag/v_claim_full haben sie NICHT) -> der SV liest sie nur aus der auftraege-
-- Tabelle direkt (SV-RLS-Zweig), nicht ueber den View-Pfad. Staff behaelt sie im Fallakte-View.
--
-- Schicht 2/2 (auftraege-RLS-Verengung fuer den Tabellen-PostgREST-Pfad + grundhonorar) folgt.
-- Verbatim-viewdef + fail-closed (jedes Muster genau 1x), analog claims-Maskierung 20260714215721.

do $$
declare
  v_def    text;
  v_needle text;
  v_repl   text;
  v_cnt    int;
  i        int;
  v_pairs  text[] := array[
    E'\n    sub.sv_notizen_vor_ort,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.sv_notizen_vor_ort ELSE NULL::text END AS sv_notizen_vor_ort,',
    E'\n    sub.filmcheck_notizen,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.filmcheck_notizen ELSE NULL::text END AS filmcheck_notizen,',
    E'\n    sub.technische_stellungnahme_notiz_sv,',
    E'\n    CASE WHEN rolle_sieht_margen() THEN sub.technische_stellungnahme_notiz_sv ELSE NULL::text END AS technische_stellungnahme_notiz_sv,'
  ];
begin
  v_def := pg_get_viewdef('public.v_claim_base'::regclass, true);
  for i in 1 .. array_length(v_pairs, 1) by 2 loop
    v_needle := v_pairs[i]; v_repl := v_pairs[i+1];
    v_cnt := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
    if v_cnt <> 1 then
      raise exception 'FAIL-CLOSED: Muster "%" kam %x vor (erwartet 1). v_claim_base weicht ab — abgebrochen.', v_needle, v_cnt;
    end if;
    v_def := replace(v_def, v_needle, v_repl);
  end loop;
  execute 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || v_def;
end $$;

-- Verifikation: die 3 Notiz-Spalten + die 9 claims-Spalten sind jetzt gegatet.
do $$
declare v_def text; v_ungated text[] := '{}'; c text;
begin
  v_def := pg_get_viewdef('public.v_claim_base'::regclass, true);
  foreach c in array array['sv_notizen_vor_ort','filmcheck_notizen','technische_stellungnahme_notiz_sv',
                           'notizen','interne_notizen','lead_preis_netto','kanzlei_honorar'] loop
    if position(E'\n    sub.'||c||',' in v_def) > 0 then v_ungated := v_ungated || c; end if;
  end loop;
  if array_length(v_ungated,1) is not null then
    raise exception 'FAIL-CLOSED: laufen weiterhin roh durch v_claim_base: %', v_ungated;
  end if;
  raise notice 'OK: SV-Notizen + claims-Spalten in v_claim_base gegatet.';
end $$;
