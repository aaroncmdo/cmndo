-- CMM-49 RLS: can_access_fall -> can_access_claim — KALTER Teil (Funktion + 11 unkritische Policies).
-- Aequivalenz live bewiesen (claim_id == Claim des fall_id, viol=0 ueber alle 13 Tische) =>
-- can_access_claim(claim_id) identisch zu can_access_fall(fall_id) fuer jeden User/Row.
-- In 2 Teile gesplittet (cold/hot) wegen Deadlock mit parallelen 939-Sessions auf den heissen Tischen.
SET LOCAL lock_timeout = '8s';

-- can_access_claim: faelle-freies Spiegelbild von can_access_fall
CREATE OR REPLACE FUNCTION public.can_access_claim(p_claim_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin'::user_role, 'dispatch'::user_role))
    OR
    EXISTS (SELECT 1 FROM claims c JOIN profiles p ON p.id = auth.uid()
            WHERE c.id = p_claim_id AND p.rolle = 'kundenbetreuer'::user_role AND c.kundenbetreuer_id = auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.can_access_claim(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_access_claim(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_access_claim(uuid) IS 'CMM-49: faelle-freies Spiegelbild von can_access_fall (claim_id-basiert). Loest can_access_fall in den staff_fall_scoped-RLS-Policies ab; can_access_fall stirbt mit faelle.';

-- 9 simple staff_fall_scoped (kalt)
DO $$
DECLARE t text;
  tbls text[] := ARRAY['abrechnung_positionen','fall_dokumente','pflichtdokumente','qc_checkliste','reklamationen','schadenspositionen','timeline','zahlungseingaenge','zahlungspositionen'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER POLICY staff_fall_scoped ON public.%I USING (can_access_claim(claim_id)) WITH CHECK (can_access_claim(claim_id))', t);
  END LOOP;
END $$;

-- forderungspositionen (OR is_kanzlei() erhalten)
ALTER POLICY staff_fall_scoped ON public.forderungspositionen
  USING (can_access_claim(claim_id) OR is_kanzlei())
  WITH CHECK (can_access_claim(claim_id) OR is_kanzlei());

-- reklamationen.sv_own_read (SELECT; sv_id-Leg erhalten)
ALTER POLICY sv_own_read ON public.reklamationen
  USING ((sv_id = get_sv_id()) OR can_access_claim(claim_id));
