-- AAR-1478 Post-Apply-Verify-Probe.
-- Nach `npx supabase db push` ausfuehren um zu bestaetigen dass der RPC-Fix greift.
--
-- Erwartung:
--  1. Function-Definition enthaelt 'source_channel' + 'status' im INSERT-Block
--  2. Wenn neue Anfrage via submitKfzgutachterLead reinkommt, hat der Lead
--     source_channel='kfzgutachter-ads-lp' (nicht mehr NULL)
--  3. status ist 'neu' (explicit gesetzt, nicht mehr nur DB-Default)

-- 1. Funktion-Body prüfen
SELECT
  proname AS function_name,
  CASE
    WHEN prosrc LIKE '%source_channel%' AND prosrc LIKE '%v_anfrage.quelle%'
    THEN 'OK — source_channel gemappt aus v_anfrage.quelle'
    ELSE 'FEHLER — source_channel-Mapping fehlt im Function-Body'
  END AS source_channel_check,
  CASE
    WHEN prosrc LIKE '%''neu''::lead_status%'
    THEN 'OK — status explizit gesetzt'
    ELSE 'FEHLER — status nicht explizit gesetzt'
  END AS status_check
FROM pg_proc
WHERE proname = 'convert_anfrage_zu_lead'
  AND pronamespace = 'public'::regnamespace;

-- 2. NULL-source_channel-Verteilung nach Migration (Smoke-Daten bleiben — sind ok)
SELECT
  COALESCE(source_channel, '(NULL — pre-1478)') AS source_channel,
  count(*) AS lead_count,
  min(created_at) AS first_seen,
  max(created_at) AS last_seen
FROM public.leads
GROUP BY source_channel
ORDER BY lead_count DESC NULLS LAST;

-- 3. Function-Grants pruefen (defense gegen AAR-894-Pattern, siehe Issue #1485)
SELECT
  p.proname,
  array_agg(DISTINCT r.rolname ORDER BY r.rolname) AS roles_with_execute
FROM pg_proc p
LEFT JOIN pg_proc_acl pa ON pa.proc_oid = p.oid -- existiert in einigen PG-Versionen
LEFT JOIN aclexplode(p.proacl) ax ON true
LEFT JOIN pg_roles r ON r.oid = ax.grantee
WHERE p.proname = 'convert_anfrage_zu_lead'
  AND ax.privilege_type = 'EXECUTE'
GROUP BY p.proname;
