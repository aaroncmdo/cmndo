-- Hardening (SP4 Final-Review): der Kunde darf nur einen Termin fuer die
-- TATSAECHLICH vermittelte Werkstatt seines Claims anlegen
-- (werkstatt_id == claims.reparatur_werkstatt_id). Schliesst die
-- Direkt-Insert-Luecke; die Action (liest werkstatt_id aus dem Claim) passt
-- weiterhin durch. Ersetzt reparatur_termine_kunde_insert aus 20260704083420.

DROP POLICY IF EXISTS reparatur_termine_kunde_insert ON public.reparatur_termine;
CREATE POLICY reparatur_termine_kunde_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'angefragt'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND c.reparatur_werkstatt_id = reparatur_termine.werkstatt_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
