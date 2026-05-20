-- AAR-1491 Post-Apply-Verify: Index ist auf leads.status registriert.
-- Erwartung: 1 Zeile mit idx_leads_status / btree / column=status.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leads'
  AND indexname = 'idx_leads_status';

-- EXPLAIN auf Dispatch-Filter-Query: sollte Index Scan zeigen (nicht Seq Scan).
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, created_at, vorname, nachname
FROM public.leads
WHERE status = 'neu'
ORDER BY created_at DESC
LIMIT 50;
