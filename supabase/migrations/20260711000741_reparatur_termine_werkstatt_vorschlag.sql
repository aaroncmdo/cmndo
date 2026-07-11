-- Reparaturtermin-Verhandlung: Werkstatt schlaegt abweichenden Termin vor (werkstatt_vorschlag);
-- Kunde reagiert (Passt -> bestaetigt / Passt nicht -> anruf_erbeten + rueckruf_wunschzeit).
ALTER TABLE public.reparatur_termine DROP CONSTRAINT reparatur_termine_status_check;
ALTER TABLE public.reparatur_termine ADD CONSTRAINT reparatur_termine_status_check
  CHECK (status IN ('angefragt','werkstatt_vorschlag','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert'));

ALTER TABLE public.reparatur_termine ADD COLUMN IF NOT EXISTS rueckruf_wunschzeit timestamptz;
COMMENT ON COLUMN public.reparatur_termine.rueckruf_wunschzeit IS
  'Vom Kunden gewuenschte Rueckrufzeit (UTC), gesetzt bei "Passt nicht" -> die Werkstatt ruft zurueck.';

-- Kunde darf einen Werkstatt-Vorschlag annehmen (-> bestaetigt) oder ablehnen (-> anruf_erbeten).
-- USING gated die ALTE Zeile (nur werkstatt_vorschlag, nur eigener Claim),
-- WITH CHECK die NEUE Zeile (nur bestaetigt|anruf_erbeten). Owner-Praedikat woertlich
-- aus reparatur_termine_kunde_select (geschaedigter ODER claim_party).
CREATE POLICY reparatur_termine_kunde_update ON public.reparatur_termine
  FOR UPDATE TO authenticated
  USING (
    status = 'werkstatt_vorschlag'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  )
  WITH CHECK (
    status IN ('bestaetigt','anruf_erbeten')
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
