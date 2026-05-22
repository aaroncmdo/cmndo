-- CMM-44 SP-J PR1 (Bucket B) — Verify: 8 Bucket-B-Spalten neu auf claims
-- Expected nach Apply: bucketB_neu_auf_claims = 8
SELECT count(*) AS bucketB_neu_auf_claims
FROM information_schema.columns
WHERE table_schema='public' AND table_name='claims'
  AND column_name IN (
    'guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag',
    'auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto',
    'abrechnung_id','kanzlei_abrechnung_id'
  );
