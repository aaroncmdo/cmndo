-- AAR-1505 (Lead-Audit P2 Drift-Cleanup): Repo-Truth fuer 7 leads-Indexe die
-- live existieren aber nicht in supabase/migrations/.
--
-- Befund: pg_indexes zeigt diese Indexe auf public.leads, grep nach den
-- Index-Namen in supabase/ = 0 Treffer. Wurden vermutlich ueber Supabase-
-- Studio direkt angelegt (AGENTS.md Regel 2-Verletzung).
--
-- Konsequenz vor diesem PR: `supabase db reset` haette die Indexe nicht
-- wiederhergestellt → DB-Schema nicht voll reproducible.
--
-- Diese Migration ist no-op gegen die Live-DB (IF NOT EXISTS).
--
-- Siehe auch #1491 (idx_leads_status, gleicher Pattern).
-- Out of scope: leads_lead_nummer_key + leads_zb1_token_key — sind UNIQUE-
-- Constraints (kein standalone Index) und gehoeren in separates Constraint-
-- Drift-Cleanup-Issue.

-- 1. Foreign-Key-Lookup-Indexe
CREATE INDEX IF NOT EXISTS idx_leads_kunde_id
  ON public.leads USING btree (kunde_id);

CREATE INDEX IF NOT EXISTS idx_leads_zugewiesen_an
  ON public.leads USING btree (zugewiesen_an);

-- 2. Reminder-Cron-Indexe (Partial — extrem effizient fuer den taeglichen Scan)
CREATE INDEX IF NOT EXISTS idx_leads_reminder_candidates
  ON public.leads USING btree (created_at)
  WHERE (status = 'neu'::lead_status AND disqualifiziert = false);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_reminder_token
  ON public.leads USING btree (reminder_token);

-- 3. Workflow-Marker-Indexe (Partial — nur Rows wo der Marker gesetzt ist)
CREATE INDEX IF NOT EXISTS idx_leads_promotion_code
  ON public.leads USING btree (promotion_code_id)
  WHERE (promotion_code_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_leads_rueckruf_geplant_am
  ON public.leads USING btree (rueckruf_geplant_am)
  WHERE (rueckruf_geplant_am IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_geprueft_am
  ON public.leads USING btree (whatsapp_geprueft_am)
  WHERE (whatsapp_geprueft_am IS NOT NULL);
