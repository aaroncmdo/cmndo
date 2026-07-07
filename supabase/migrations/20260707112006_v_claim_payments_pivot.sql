-- Payment-Ledger-Normalisierung Phase 2: Pivot-View (Ledger-Zeilen -> pro-partei-Spalten).
-- Additiv (beruehrt keine bestehende View). security_invoker=true -> erbt claim_payments-RLS
-- (admin ODER besitzender KB); anon revoked. Die Haupt-DEFINER-Views joinen sie spaeter (COALESCE
-- mit den Alt-Cache-Spalten, bis Phase 3). Unique(claim_id,partei) -> max()FILTER = der eine Wert.
CREATE VIEW public.v_claim_payments
WITH (security_invoker = true) AS
SELECT
  claim_id,
  max(forderungsbetrag)  FILTER (WHERE partei = 'vs')    AS vs_soll,
  max(erhaltener_betrag)  FILTER (WHERE partei = 'vs')    AS vs_ist,
  max(zahlungseingang_am) FILTER (WHERE partei = 'vs')    AS vs_am,
  max(status)             FILTER (WHERE partei = 'vs')    AS vs_status,
  max(zahlungsweg)        FILTER (WHERE partei = 'vs')    AS vs_zahlungsweg,
  max(forderungsbetrag)  FILTER (WHERE partei = 'kunde') AS kunde_soll,
  max(erhaltener_betrag)  FILTER (WHERE partei = 'kunde') AS kunde_ist,
  max(zahlungseingang_am) FILTER (WHERE partei = 'kunde') AS kunde_am,
  max(status)             FILTER (WHERE partei = 'kunde') AS kunde_status,
  max(forderungsbetrag)  FILTER (WHERE partei = 'sv')    AS sv_soll,
  max(erhaltener_betrag)  FILTER (WHERE partei = 'sv')    AS sv_ist,
  max(zahlungseingang_am) FILTER (WHERE partei = 'sv')    AS sv_am,
  max(status)             FILTER (WHERE partei = 'sv')    AS sv_status
FROM public.claim_payments
GROUP BY claim_id;

REVOKE ALL ON public.v_claim_payments FROM anon;
GRANT SELECT ON public.v_claim_payments TO authenticated;

COMMENT ON VIEW public.v_claim_payments IS
  'Payment-Ledger Pivot: claim_payments-Zeilen -> pro-partei-Spalten (vs/kunde/sv je soll/ist/am/status). security_invoker -> claim_payments-RLS. DRY-Read-Layer fuer die Haupt-Views (Payment-Ledger-Normalisierung Phase 2).';
