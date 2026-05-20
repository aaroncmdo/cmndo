-- AAR-1491 (Lead-Audit P2-7): Repo-Truth fuer existing Index idx_leads_status.
--
-- Audit-Befund 20.05.2026: "kein Index auf leads.status". Live-Verifikation
-- (scripts/probe-existing-leads-indexes.sql) zeigte: Index existiert seit
-- unbekanntem Zeitpunkt — aber NICHT in supabase/migrations/ vorhanden
-- (grep nach "idx_leads_status" in supabase/ = 0 Treffer). Wurde vermutlich
-- ueber Supabase-Studio direkt angelegt — AGENTS.md Regel 2-Verletzung.
--
-- Diese Migration ist no-op gegen die Live-DB (IF NOT EXISTS), erfasst den
-- Index aber als Repo-Truth damit `supabase db reset` reproducible bleibt.
--
-- EXPLAIN-Probe vor diesem PR (scripts/probe-explain-leads-status-before.sql):
--   Index Scan using idx_leads_status on leads
--   Execution Time: 1.629 ms
-- → Performance ist bereits gut, keine zusaetzliche composite-Optimierung
--   noetig fuer Issue #1491.
--
-- Weitere live-aber-nicht-in-Migrations Indexe (separater Drift-Cleanup-PR):
--   idx_leads_kunde_id, idx_leads_promotion_code, idx_leads_reminder_candidates,
--   idx_leads_reminder_token, idx_leads_rueckruf_geplant_am,
--   idx_leads_whatsapp_geprueft_am, idx_leads_zugewiesen_an,
--   leads_lead_nummer_key, leads_zb1_token_key

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON public.leads USING btree (status);
