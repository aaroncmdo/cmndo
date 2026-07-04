-- SP4a+b: Kunde-RLS auf reparatur_termine.
-- SELECT: der Geschaedigte (bzw. claim_party) liest den Termin seines eigenen Claims.
-- INSERT: der Kunde schlaegt einen Wunschtermin vor (nur status='angefragt', nur eigener Claim).
-- Owner-Praedikat woertlich aus der claims-SELECT-Policy uebernommen.
-- Werkstatt-Statuswechsel bleiben Staff+Werkstatt (SP2); Kunde bekommt KEIN UPDATE/DELETE.

CREATE POLICY reparatur_termine_kunde_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );

CREATE POLICY reparatur_termine_kunde_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'angefragt'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
