-- CMM-44 SP-G — welche Views exponieren eine der 19 SP-G-Spalten?
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN (
    'gutachten_eingegangen_am','gutachten_betrag','gutachter_honorar',
    'ocr_extrahiert_am','ocr_rohdaten','gutachten_hochgeladen_am',
    'gutachten_nummer','reparaturkosten','wertminderung',
    'nutzungsausfall_tagessatz','reparaturdauer_tage',
    'ki_kalkulation','ki_kalkulation_am','ki_geschaetzte_kosten_min',
    'ki_geschaetzte_kosten_max','gutachten_positionen',
    'gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt'
  )
ORDER BY c.table_name, c.column_name;
