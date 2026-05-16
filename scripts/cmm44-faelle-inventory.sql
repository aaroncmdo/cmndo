-- CMM-44 Phase-1 Dekomposition: Spalten-Inventar faelle + Ziel-Tabellen
-- Run: npx supabase db query --linked --file scripts/cmm44-faelle-inventory.sql
-- (db query liefert nur das LETZTE Result-Set zurueck -> nur ein SELECT.)
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  EXISTS (
    SELECT 1 FROM information_schema.columns x
    WHERE x.table_schema = 'public' AND x.table_name = 'claims'
      AND x.column_name = c.column_name
  ) AS auch_auf_claims
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'faelle', 'claims', 'leads', 'vehicles', 'auftraege',
    'kanzlei_faelle', 'gutachter_termine', 'gutachten', 'claim_parties'
  )
ORDER BY c.table_name, c.ordinal_position;
