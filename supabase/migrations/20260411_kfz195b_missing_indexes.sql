-- KFZ-195b: Fehlende Indexes auf haeufig gefilterten Spalten
-- Applied via Supabase MCP on 2026-04-11

CREATE INDEX IF NOT EXISTS idx_faelle_kundenbetreuer_id ON faelle(kundenbetreuer_id);
CREATE INDEX IF NOT EXISTS idx_faelle_status ON faelle(status);
CREATE INDEX IF NOT EXISTS idx_leads_zugewiesen_an ON leads(zugewiesen_an);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
