-- CMM-44 SP-J — View-Audit: welche Views exponieren eine der 11 A+B-Spalten?
-- (Bucket A: zahlung_eingegangen_am, zahlungsweg, zahlung_betrag
--  Bucket B: guthaben_verrechnet_netto, schlussabrechnung_am, auszahlung_gutachter_betrag,
--            auszahlung_gutachter_eingegangen_am, auszahlung_zahlungsweg, sv_nachzahlung_netto,
--            abrechnung_id, kanzlei_abrechnung_id)
-- Ergebnis 2026-05-22 (live):
--   faelle_kunde_view              -> auszahlung_zahlungsweg                (Bucket B)
--   faelle_sv_view                 -> auszahlung_gutachter_eingegangen_am   (Bucket B)
--   v_faelle_mit_aktuellem_termin  -> alle 11 (3 A + 8 B)
SELECT c.table_name AS view_name, string_agg(c.column_name, ', ' ORDER BY c.column_name) AS cols
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema=c.table_schema AND v.table_name=c.table_name
WHERE c.table_schema='public' AND c.column_name IN (
  'zahlung_eingegangen_am','zahlungsweg','zahlung_betrag',
  'guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag',
  'auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto',
  'abrechnung_id','kanzlei_abrechnung_id'
)
GROUP BY c.table_name ORDER BY c.table_name;
