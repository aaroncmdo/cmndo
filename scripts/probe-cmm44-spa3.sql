-- SP-A3 Verify-Queries (CMM-44 — faelle.fall_nummer abschaffen)
-- Aufruf: npx supabase db query --linked --file scripts/probe-cmm44-spa3.sql
-- Hinweis: keine psql-\echo-Metabefehle, damit das Script auch ueber
--   `db query --linked --file` laeuft (fuehrt nur reines SQL aus).

-- == fall_nummer auf faelle vorhanden? (erwartet: 1 bis PR3) ==
SELECT 'fall_nummer_auf_faelle' AS pruefung, count(*) AS treffer
FROM information_schema.columns
WHERE table_name = 'faelle' AND column_name = 'fall_nummer';

-- == claim_nummer in den 5 Views vorhanden? (erwartet nach PR1: alle 5) ==
SELECT 'view_mit_claim_nummer' AS pruefung, table_name
FROM information_schema.columns
WHERE column_name = 'claim_nummer'
  AND table_name IN (
    'v_claim_full', 'v_claim_listing', 'v_faelle_mit_aktuellem_termin',
    'faelle_kunde_view', 'faelle_sv_view'
  )
ORDER BY table_name;

-- == set_fall_nummer Trigger / generate_fall_nummer Funktion vorhanden? ==
-- (erwartet: je 1 bis PR3, danach 0)
SELECT 'trigger_set_fall_nummer' AS art, count(*) AS treffer
FROM pg_trigger WHERE tgname = 'set_fall_nummer'
UNION ALL
SELECT 'function_generate_fall_nummer' AS art, count(*) AS treffer
FROM pg_proc WHERE proname = 'generate_fall_nummer';
