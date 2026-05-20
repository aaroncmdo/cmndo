-- Lead-Audit 20.05.2026 — Live-Probe: leads-DB-Defaults.
-- Klärt P0-1 final (RPC convert_anfrage_zu_lead schreibt leads ohne source_channel/status).
-- Wenn beide NOT NULL ohne DEFAULT → RPC schlägt aktiv fehl in Prod.
-- Wenn status DEFAULT 'neu' → P0 wird P1 für status; source_channel bleibt P0.

SELECT
  column_name,
  column_default,
  is_nullable,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'leads'
  AND column_name IN ('status', 'source_channel')
ORDER BY column_name;

-- lead_status-Enum-Werte verifizieren (Vertikal-Agent vs Horizontal-Agent Konflikt zu 'quali-offen').
SELECT unnest(enum_range(NULL::public.lead_status))::text AS lead_status_value
ORDER BY 1;
