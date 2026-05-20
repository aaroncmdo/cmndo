-- Lead-Audit 20.05.2026 — service_role Baseline: source_channel-Verteilung in Prod.
-- Zeigt empirisch die RPC-Drift (NULL-Leads aus kfzgutachter-LP).
SELECT
  COALESCE(source_channel, '(NULL — drift via RPC)') AS source_channel,
  count(*) AS lead_count,
  count(*) FILTER (WHERE status = 'neu') AS status_neu,
  count(*) FILTER (WHERE status = 'umgewandelt' OR status = 'umgewandelt-sv') AS status_umgewandelt,
  count(*) FILTER (WHERE disqualifiziert = true) AS disqualifiziert
FROM public.leads
GROUP BY source_channel
ORDER BY lead_count DESC NULLS LAST;
