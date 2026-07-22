-- AAR-956 T2 Follow-up (Merge-Session Regel-2-Nachzug zu #4702).
-- claims.schuldfrage + claims.eigene_versicherung wurden von #4702 (Mig 20260722202021)
-- prod-appliziert OHNE authenticated-Grant -> Claims-Column-Grants-Guard rot, blockte
-- #4702 + #4709 fleet-weit (manifest). Beide sind nicht-sensible User-eigene Claim-Inputs
-- (Schuldfrage-Antwort, eigene-Versicherung ja/nein), RLS-scoped -> granten statt cappen
-- (kategorisch anders als v_intern-Finanzfelder; R71/R92-Klasse). Owner e67d25d8 inaktiv.
-- Prod bereits appliziert+getrackt als 20260722214523; dieses File = Git-Nachzug (kein Twin-Drift).
GRANT SELECT (schuldfrage, eigene_versicherung) ON public.claims TO authenticated;
