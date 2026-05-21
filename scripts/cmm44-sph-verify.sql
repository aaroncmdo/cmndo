-- CMM-44 SP-H — Verify: 18 neue Spalten auf auftraege?
SELECT count(*) AS sph_neu_auf_auftraege
FROM information_schema.columns
WHERE table_schema='public' AND table_name='auftraege'
  AND column_name IN (
    'filmcheck_ok','filmcheck_am','filmcheck_notizen',
    'storniert_am','storno_grund','storno_durch_user_id',
    'besichtigung_gestartet_am',
    'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
    'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
    'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
    'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
    'technische_stellungnahme_freigabe_am'
  );
