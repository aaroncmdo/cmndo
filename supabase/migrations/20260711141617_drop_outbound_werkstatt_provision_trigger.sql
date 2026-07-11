-- Werkstatt-Provision INBOUND-ONLY (Aaron 11.07., definitiv):
-- Provision NUR wenn eine Werkstatt uns einen Haftpflichtschaden VERMITTELT (inbound, claims.werkstatt_id).
-- Claimondo -> Werkstatt (outbound, claims.reparatur_werkstatt_id) = KEINE Provision.
-- Der Outbound-Trigger war zudem Twin-Drift (nur in der DB, in KEINEM Migration-File) -> diese Migration heilt das.
DROP TRIGGER IF EXISTS trg_werkstatt_provision_on_reparatur_assign ON public.claims;
DROP FUNCTION IF EXISTS public.create_werkstatt_provision_on_reparatur_assign();
