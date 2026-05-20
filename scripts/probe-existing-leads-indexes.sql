-- AAR-1491 Live-Verifikation: welche Indexe existieren auf public.leads?
-- Audit-Behauptung war "kein Index auf leads.status", aber EXPLAIN zeigt
-- "Index Scan using idx_leads_status" → Index ist live, Audit war zu schnell.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leads'
ORDER BY indexname;
