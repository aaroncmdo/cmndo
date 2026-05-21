-- CMM-44 SP-G2 — Post-Migration-Verify (eine UNION-ALL-Query, (k,v)-Spalten).
-- Erwartung nach Apply: old_*_gone=true, new_trigger_present=true, violations=0,
--   view_faelle_claim=true, view_timeline_claim=true, timeline_no_faelle_join=true.
SELECT 'old_trigger_gone' AS k, (NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_sync_gutachter_termine_claim_id'))::text AS v
UNION ALL SELECT 'old_function_gone', (NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='sync_gutachter_termine_claim_id'))::text
UNION ALL SELECT 'new_trigger_present', (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validate_gutachter_termine_claim_id'))::text
UNION ALL SELECT 'violations', (SELECT count(*)::text FROM public.gutachter_termine WHERE fall_id IS NOT NULL AND claim_id IS NULL)
UNION ALL SELECT 'view_faelle_claim', (position('gt.claim_id' in pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0)::text
UNION ALL SELECT 'view_timeline_claim', (position('gt.claim_id' in pg_get_viewdef('public.v_claim_timeline', true)) > 0)::text
UNION ALL SELECT 'timeline_no_faelle_join', (position('f.id = gt.fall_id' in pg_get_viewdef('public.v_claim_timeline', true)) = 0)::text;
