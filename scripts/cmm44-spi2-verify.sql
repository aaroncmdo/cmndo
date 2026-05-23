-- Vor Apply: 0. Nach Apply: 11.
SELECT count(*) AS spi2_neu_auf_kanzlei_faelle FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer']);
-- Vor Apply: alle false. Nach Apply: alle true.
SELECT
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'kf\.anschlussschreiben_am' AS v_term_as,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'kf\.mandatsnummer' AS v_term_mandat,
  pg_get_viewdef('public.v_claim_full',true) ~ 'kf\.anschlussschreiben_am' AS v_full_as,
  pg_get_viewdef('public.faelle_sv_view',true) ~ 'kf\.mandatsnummer' AS svview_mandat,
  pg_get_viewdef('public.faelle_sv_view',true) ~ 'kf\.lexdrive_case_id' AS svview_caseid;
-- Nach Apply: mandatsnummer-Backfill = 12 Rows auf kanzlei_faelle.
SELECT count(*) AS kf_mandat_backfilled FROM public.kanzlei_faelle WHERE mandatsnummer IS NOT NULL;
