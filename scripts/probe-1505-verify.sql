-- AAR-1505 Post-Apply-Verify: alle 7 erfassten Indexe sind nach `supabase db push`
-- weiter da (sollten unchanged sein wegen IF NOT EXISTS).
-- Erwartung: 7 Zeilen (eine pro Index-Name).

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leads'
  AND indexname IN (
    'idx_leads_kunde_id',
    'idx_leads_zugewiesen_an',
    'idx_leads_reminder_candidates',
    'idx_leads_reminder_token',
    'idx_leads_promotion_code',
    'idx_leads_rueckruf_geplant_am',
    'idx_leads_whatsapp_geprueft_am'
  )
ORDER BY indexname;

-- Total-Count auf leads-Indexe — sollte unverändert 15 sein (no-op).
SELECT count(*) AS total_indexes_on_leads
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'leads';
