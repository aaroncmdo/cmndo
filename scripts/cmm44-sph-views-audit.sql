-- CMM-44 SP-H — welche Views exponieren eine der 18 SP-H-Spalten?
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN (
    'filmcheck_ok','filmcheck_am','filmcheck_notizen',
    'storniert_am','storno_grund','storno_durch_user_id',
    'besichtigung_gestartet_am',
    'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
    'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
    'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
    'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
    'technische_stellungnahme_freigabe_am'
  )
ORDER BY c.table_name, c.column_name;
