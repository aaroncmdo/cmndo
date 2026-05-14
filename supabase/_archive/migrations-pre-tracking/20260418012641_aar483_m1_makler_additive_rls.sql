-- AAR-483 (M1): Additive RLS-Policies für Makler-Portal. Bestehende
-- Policies (makler_self_read, makler_admin_all, promo_*, mfc_*, mp_*)
-- bleiben unverändert. Nur fehlende UPDATE-Policies + Cross-Table-Read
-- für leads/faelle werden ergänzt.

-- makler: Self-Update (Kontakt-/Profildaten eigener Row)
CREATE POLICY "makler_self_update" ON public.makler
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- makler_fall_consent: Self-Revoke (Makler darf eigenes Consent widerrufen)
CREATE POLICY "mfc_self_revoke" ON public.makler_fall_consent
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.makler m
      WHERE m.id = makler_fall_consent.makler_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (widerrufen_am IS NOT NULL);

-- leads: Makler liest Leads mit eigenem promotion_code
CREATE POLICY "leads_makler_read" ON public.leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promotion_codes pc
      JOIN public.makler m ON m.id = pc.makler_id
      WHERE pc.id = leads.promotion_code_id AND m.user_id = auth.uid()
    )
  );

-- faelle: Makler liest Fälle mit aktivem Consent
CREATE POLICY "faelle_makler_read" ON public.faelle
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.makler_fall_consent mfc
      JOIN public.makler m ON m.id = mfc.makler_id
      WHERE mfc.fall_id = faelle.id
        AND m.user_id = auth.uid()
        AND mfc.widerrufen_am IS NULL
    )
  );

COMMENT ON POLICY "makler_self_update" ON public.makler IS
  'AAR-483 M1: Makler darf eigene Stammdaten editieren.';
COMMENT ON POLICY "mfc_self_revoke" ON public.makler_fall_consent IS
  'AAR-483 M1: Makler darf eigenes Consent widerrufen (WITH CHECK erzwingt widerrufen_am != NULL).';
COMMENT ON POLICY "leads_makler_read" ON public.leads IS
  'AAR-483 M1: Makler liest nur Leads seiner promotion_codes.';
COMMENT ON POLICY "faelle_makler_read" ON public.faelle IS
  'AAR-483 M1: Makler liest nur Fälle mit aktivem Consent.';;
