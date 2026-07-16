-- T3-slice-3d: Value-Swap der status-Projektion in v_claim_base / v_claim_sv / v_claim_listing /
-- v_claim_for_gast: Output-Spalte `status` speist sich jetzt aus operative_status statt claims.status.
-- Spaltenset/Namen/Typen unveraendert (CREATE OR REPLACE) -> Grants/Consumer stabil.
-- v_claim_full re-projiziert v_claim_base.status und erbt den Swap automatisch.
-- Consumer-Analyse (16.07.): v_claim_base/sv/for_gast = 0 Code-Consumer; v_claim_listing = 2 echte
-- (faelle + admin/faelle: Filter neq.storniert bleibt korrekt da Terminals wertidentisch; /faelle zeigt
-- kuenftig Cursor-Badges statt '—' fuer aktive Claims — gewollt). Kein Reader nutzt NULL-als-Bedeutung.
-- Terminals sind post-Konvergenz wertidentisch; non-terminal war claims.status NULL -> jetzt Phasen-Cursor.
-- ACHTUNG reloptions: CREATE OR REPLACE resettet sie (empirisch) -> Restore in t3_slice3e.
DO $$
DECLARE v_def text; v_cnt int; v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['v_claim_base','v_claim_sv','v_claim_listing'] LOOP
    v_def := pg_get_viewdef(('public.' || v_name)::regclass, true);
    v_cnt := (SELECT count(*) FROM regexp_matches(v_def, '\mc\.status\M', 'g'));
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION '%: erwartet genau 1 c.status-Referenz, gefunden %', v_name, v_cnt;
    END IF;
    v_def := regexp_replace(v_def, '\mc\.status,', 'c.operative_status AS status,');
    IF v_def ~ '\mc\.status\M' THEN
      RAISE EXCEPTION '%: c.status nach Replace uebrig — unerwartete Def-Form (kein Komma-Suffix?)', v_name;
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.' || v_name || ' AS ' || v_def;
  END LOOP;
END $$;

-- v_claim_for_gast: klein -> statisch (bare `status,` ohne Alias-Prefix, daher nicht im Loop).
CREATE OR REPLACE VIEW public.v_claim_for_gast AS
 SELECT id,
    schadentag,
    schadenzeit,
    schadenort_ort,
    schadenort_plz,
    schadenort_land,
    schadenort_kategorie,
    hergang_kunde_text,
    schadenart,
    unfall_konstellation,
    fahrerflucht,
    polizei_aktenzeichen,
    polizei_bericht_vorhanden,
    gegner_versicherung_id,
    hat_personenschaden,
    hat_mietwagen,
    unfallskizze_url,
    unfallskizze_svg,
    operative_status AS status,
    created_at,
    updated_at
   FROM claims c
  WHERE (EXISTS ( SELECT 1
           FROM claim_parties cp
          WHERE cp.claim_id = c.id AND cp.user_id = auth.uid() AND cp.ist_aktiv = true));
