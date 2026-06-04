-- CMM-49 P2: faelle_claim_bridge SELECT-Policy, die faelle's Multi-Rollen-Zugriff exakt spiegelt
-- (claim-/bridge-basiert, faelle-frei) — Voraussetzung dafuer, dass resolveClaimId Step-2 von faelle
-- auf die bridge umgestellt werden kann, ohne Kunde/SV/Kanzlei/Makler-Zugriff zu brechen.
-- Spiegelt: kunde (claims.geschaedigter_user_id == faelle.kunde_id, CMM-63 0-diff), sv (claims.sv_id),
-- kanzlei (claims.service_typ='komplett'), makler (makler_fall_consent.fall_id == bridge.fall_id),
-- staff (is_admin/dispatch/KB). Predikat-Muster 1:1 aus den faelle-Policies uebernommen.
CREATE POLICY faelle_claim_bridge_select_consolidated ON public.faelle_claim_bridge
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = 'dispatch'::user_role)
    OR (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = 'kundenbetreuer'::user_role)
        AND EXISTS (SELECT 1 FROM claims c WHERE c.id = faelle_claim_bridge.claim_id AND c.kundenbetreuer_id = (SELECT auth.uid())))
    OR EXISTS (SELECT 1 FROM claims c WHERE c.id = faelle_claim_bridge.claim_id AND (
         c.geschaedigter_user_id = (SELECT auth.uid())
         OR c.sv_id IN (SELECT sachverstaendige.id FROM sachverstaendige WHERE sachverstaendige.profile_id = (SELECT auth.uid()))
         OR (c.service_typ = 'komplett'::text AND EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND rolle = 'kanzlei'::user_role))
       ))
    OR EXISTS (SELECT 1 FROM makler_fall_consent mfc JOIN makler m ON m.id = mfc.makler_id
               WHERE mfc.fall_id = faelle_claim_bridge.fall_id AND m.user_id = (SELECT auth.uid()) AND mfc.widerrufen_am IS NULL)
  );
