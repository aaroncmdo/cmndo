-- CMM-44 SP-I2 -- Existenz/Typ auf faelle + ob schon auf kanzlei_faelle + Coverage
SELECT 'faelle' AS tbl, column_name, data_type, is_nullable, COALESCE(column_default,'') AS dflt
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer'])
UNION ALL
SELECT 'kanzlei_faelle', column_name, data_type, is_nullable, COALESCE(column_default,'')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer'])
ORDER BY tbl, column_name;
SELECT count(*) AS kf_rows FROM public.kanzlei_faelle;
