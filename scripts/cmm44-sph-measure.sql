-- CMM-44 SP-H — Live-DB-Messung (2026-05-20)
-- 18 Auftrag-LC-Spalten in `faelle` (Verdikt MOVE→auftraege).
-- Misst: faelle-Schema + Coverage der 18, auftraege-Ziel-Spalten-Existenz,
-- 1:N-Cardinality, Trigger.
WITH sph(srt, faelle_col, ziel) AS (VALUES
  -- Filmcheck (3)
  ( 1, 'filmcheck_ok',                          'filmcheck_ok'),
  ( 2, 'filmcheck_am',                          'filmcheck_am'),
  ( 3, 'filmcheck_notizen',                     'filmcheck_notizen'),
  -- Storno (3)
  ( 4, 'storniert_am',                          'storniert_am'),
  ( 5, 'storno_grund',                          'storno_grund'),
  ( 6, 'storno_durch_user_id',                  'storno_durch_user_id'),
  -- Besichtigung (1)
  ( 7, 'besichtigung_gestartet_am',             'besichtigung_gestartet_am'),
  -- SV-Briefing (6)
  ( 8, 'sv_briefing_text',                      'sv_briefing_text'),
  ( 9, 'sv_briefing_generated_at',              'sv_briefing_generated_at'),
  (10, 'sv_briefing_model',                     'sv_briefing_model'),
  (11, 'sv_briefing_version',                   'sv_briefing_version'),
  (12, 'sv_briefing_struktur',                  'sv_briefing_struktur'),
  (13, 'sv_notizen_vor_ort',                    'sv_notizen_vor_ort'),
  -- TechStellungnahme (5)
  (14, 'technische_stellungnahme_notiz_sv',     'technische_stellungnahme_notiz_sv'),
  (15, 'technische_stellungnahme_status',       'technische_stellungnahme_status'),
  (16, 'technische_stellungnahme_beauftragt_am','technische_stellungnahme_beauftragt_am'),
  (17, 'technische_stellungnahme_hochgeladen_am','technische_stellungnahme_hochgeladen_am'),
  (18, 'technische_stellungnahme_freigabe_am',  'technische_stellungnahme_freigabe_am')
)
SELECT 0 AS srt, 'TOTALS: faelle.rows='
  || (SELECT count(*) FROM public.faelle)::text
  || ' | auftraege.spalten='
  || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='auftraege')::text
  || ' | auftraege.rows='
  || (SELECT count(*) FROM public.auftraege)::text
  || ' | distinct_claims='
  || (SELECT count(DISTINCT claim_id) FROM public.auftraege WHERE claim_id IS NOT NULL)::text AS zeile
UNION ALL
SELECT 100 + s.srt AS srt,
  rpad(s.faelle_col, 42) || '| f.udt=' || rpad(COALESCE(f.udt_name, '!! FEHLT'), 14)
  || ' | f.cov=' || rpad(COALESCE((SELECT count(*)::text FROM public.faelle WHERE (to_jsonb(faelle) -> s.faelle_col) IS NOT NULL AND (to_jsonb(faelle) ->> s.faelle_col) NOT IN ('', 'false', '0')), '?'), 3)
  || ' | -> a.' || rpad(s.ziel, 42)
  || CASE WHEN a.column_name IS NOT NULL
          THEN '| ✓ a.udt=' || a.udt_name || ' null=' || a.is_nullable
          ELSE '| !! FEHLT auf auftraege (PR1 ADD)' END AS zeile
FROM sph s
LEFT JOIN information_schema.columns f
  ON f.table_schema='public' AND f.table_name='faelle' AND f.column_name=s.faelle_col
LEFT JOIN information_schema.columns a
  ON a.table_schema='public' AND a.table_name='auftraege' AND a.column_name=s.ziel
ORDER BY srt;
