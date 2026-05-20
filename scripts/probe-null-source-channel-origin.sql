-- Verifiziert die Herkunft der 10 NULL-source_channel-Leads.
-- Erwartung: alle kommen aus anfragen (kfzgutachter-LP-Bypass via RPC).
-- Wenn manche KEINE matching anfrage haben, brauchen sie eigenen Backfill-Plan.
SELECT
  l.id AS lead_id,
  l.created_at,
  l.vorname,
  l.nachname,
  a.id        AS anfrage_id,
  a.quelle    AS anfrage_quelle,
  a.quelle_variant
FROM public.leads l
LEFT JOIN public.anfragen a ON a.lead_id = l.id
WHERE l.source_channel IS NULL
ORDER BY l.created_at DESC;
