-- CMM-44 SP-G2 — Live-Zustand von gutachter_termine.claim_id + CMM-58-Trigger.
-- Eine UNION-ALL-Query: supabase db query gibt bei mehreren separaten Statements
-- nur das letzte Resultset aus, darum alles als (k, v)-Zeilen in ein Statement.
-- Baseline 2026-05-21: col_nullable=YES, fk_present=1, index_present=1,
--   derive_trigger_present=1, derive_func_present=1, violations=0, raise_trap=0,
--   faelle_total=43, faelle_claim_null=0, dup_claim_ids=0, termine_total=18,
--   termine_fall_null=12.
SELECT 'col_nullable' AS k, (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='gutachter_termine' AND column_name='claim_id') AS v
UNION ALL SELECT 'fk_present', (SELECT count(*)::text FROM pg_constraint WHERE conrelid='public.gutachter_termine'::regclass AND contype='f' AND conname LIKE '%claim_id%')
UNION ALL SELECT 'index_present', (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND tablename='gutachter_termine' AND indexname='idx_gutachter_termine_claim_id')
UNION ALL SELECT 'derive_trigger_present', (SELECT count(*)::text FROM pg_trigger WHERE tgrelid='public.gutachter_termine'::regclass AND tgname='trg_sync_gutachter_termine_claim_id')
UNION ALL SELECT 'derive_func_present', (SELECT count(*)::text FROM pg_proc WHERE proname='sync_gutachter_termine_claim_id')
UNION ALL SELECT 'violations', (SELECT count(*)::text FROM public.gutachter_termine WHERE fall_id IS NOT NULL AND claim_id IS NULL)
UNION ALL SELECT 'raise_trap', (SELECT count(*)::text FROM public.gutachter_termine gt JOIN public.faelle f ON gt.fall_id=f.id WHERE gt.claim_id IS NULL AND f.claim_id IS NULL)
UNION ALL SELECT 'faelle_total', (SELECT count(*)::text FROM public.faelle)
UNION ALL SELECT 'faelle_claim_null', (SELECT count(*)::text FROM public.faelle WHERE claim_id IS NULL)
UNION ALL SELECT 'dup_claim_ids', (SELECT count(*)::text FROM (SELECT claim_id FROM public.faelle WHERE claim_id IS NOT NULL GROUP BY claim_id HAVING count(*)>1) d)
UNION ALL SELECT 'termine_total', (SELECT count(*)::text FROM public.gutachter_termine)
UNION ALL SELECT 'termine_fall_null', (SELECT count(*)::text FROM public.gutachter_termine WHERE fall_id IS NULL);
