-- CMM-44 SP-I1 — Verify: 4 neue Spalten auf kanzlei_faelle?
-- Vor Apply: 0. Nach Apply: 4.
SELECT count(*) AS spi1_neu_auf_kanzlei_faelle
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am');

-- Verify: liest die View die 4 Spalten aus kf statt f?
-- Vor Apply: alle vier false (Baseline). Nach Apply: alle vier true.
SELECT
  position('kf.lexdrive_case_id' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_case_id,
  position('kf.lexdrive_ocr_data' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_ocr_data,
  position('kf.lexdrive_ocr_received_at' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_ocr_recv,
  position('kf.klage_uebergeben_am' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_klage;
