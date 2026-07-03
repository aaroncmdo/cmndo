-- Der ECHTE externe Funnel: Test-SV-Claims + is_test_lead-Leads raus. Eine Zeile Wahrheit.
CREATE OR REPLACE VIEW public.v_funnel_real
WITH (security_invoker = true) AS
WITH real_leads AS (
  SELECT id, konvertiert_am FROM leads
  WHERE email IS NOT NULL AND NOT is_test_lead(email)
),
real_claims AS (
  SELECT c.id, c.sv_id, c.operative_status,
         (g.claim_id IS NOT NULL) AS hat_gutachten
  FROM claims c
  LEFT JOIN sachverstaendige s ON s.id = c.sv_id
  LEFT JOIN leads l ON l.id = c.lead_id
  LEFT JOIN gutachten g ON g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
  WHERE (c.sv_id IS NULL OR s.ist_testaccount IS NOT TRUE)
    AND (c.lead_id IS NULL OR NOT is_test_lead(l.email))
)
SELECT
  (SELECT count(*) FROM real_leads)                                      AS externe_leads,
  (SELECT count(*) FROM real_leads WHERE konvertiert_am IS NOT NULL)     AS konvertiert,
  (SELECT count(*) FROM real_claims)                                     AS echte_claims,
  (SELECT count(*) FROM real_claims WHERE sv_id IS NOT NULL)             AS claims_mit_sv,
  (SELECT count(*) FROM real_claims WHERE hat_gutachten)                 AS gutachten,
  (SELECT count(*) FROM real_claims WHERE operative_status = 'abgeschlossen') AS abgeschlossen;
COMMENT ON VIEW public.v_funnel_real IS
  'Echter externer Funnel (Test-SV-Claims + is_test_lead-Leads ausgeschlossen). SSoT gegen Test-Daten-Fehlalarme.';
