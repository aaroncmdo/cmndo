-- CMM-44 SP-I1 — Live-Messung der 4 LexDrive/Klage-Spalten.
-- (a) Existenz/Typ/cov auf faelle  (b) ob schon auf kanzlei_faelle  (c) View-Quelle
SELECT 'faelle' AS tbl, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am')
UNION ALL
SELECT 'kanzlei_faelle' AS tbl, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am')
ORDER BY tbl, column_name;

-- Coverage auf faelle (erwartet alle 0) + kanzlei_faelle Row-Count (erwartet 0)
SELECT
  (SELECT count(*) FROM public.faelle WHERE lexdrive_case_id IS NOT NULL) AS f_case_id,
  (SELECT count(*) FROM public.faelle WHERE lexdrive_ocr_data IS NOT NULL) AS f_ocr_data,
  (SELECT count(*) FROM public.faelle WHERE lexdrive_ocr_received_at IS NOT NULL) AS f_ocr_recv,
  (SELECT count(*) FROM public.faelle WHERE klage_uebergeben_am IS NOT NULL) AS f_klage,
  (SELECT count(*) FROM public.kanzlei_faelle) AS kf_rows;
