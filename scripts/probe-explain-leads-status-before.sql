-- AAR-1491 Pre-Apply-Probe: zeigt Seq-Scan auf leads.status vor dem Index.
-- Lauf-Hint: kann nach Apply nochmal gefahren werden (sollte dann Index-Scan zeigen).
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, created_at, vorname, nachname
FROM public.leads
WHERE status = 'neu'
ORDER BY created_at DESC
LIMIT 50;
