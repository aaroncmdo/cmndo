-- Werkstatt-Auftrag-View (Spec/Plan 2026-07-02): Ownership-Helfer analog is_sv_for_claim.
-- true wenn der Claim via werkstatt_id (inbound-QR) ODER reparatur_werkstatt_id (outbound-Vermittlung)
-- einer Werkstatt des auth.uid()-Users gehoert. Gate-Baustein fuer v_werkstatt_auftrag.
CREATE OR REPLACE FUNCTION public.is_werkstatt_for_claim(p_claim_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM claims c
    WHERE c.id = p_claim_id
      AND ( c.werkstatt_id           IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
         OR c.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid())) )
  );
$function$;
REVOKE ALL ON FUNCTION public.is_werkstatt_for_claim(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_werkstatt_for_claim(uuid) TO authenticated, service_role;
