-- AAR-810 A.1.4: faelle.claim_id als nullable FK ergänzen
-- NOT NULL kommt erst in Phase A.6 nach Backfill-Verifikation.

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES public.claims(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_faelle_claim ON public.faelle(claim_id);

COMMENT ON COLUMN public.faelle.claim_id IS
  'AAR-810 A.1: FK auf claims. Jeder fall MUSS einen claim haben (NOT NULL ab Phase A.6). Ein claim kann mehrere oder keinen fall haben.';

-- SV-Policy für claims jetzt ergänzen, wo faelle.claim_id existiert
CREATE POLICY claims_sv_assigned_select ON public.claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.claim_id = claims.id AND sv.profile_id = auth.uid()
    )
  );
