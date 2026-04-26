-- AAR-831: Rollen-RLS — Dispatcher / Kundenbetreuer / Admin auf claims
--
-- Ersetzt die zu breite claims_staff_all-Policy durch rollenspezifische Policies:
--   Admin         → RW auf alles
--   Kundenbetreuer → RW auf eigene Claims + Pool-Claims (kundenbetreuer_id IS NULL)
--   Dispatcher    → Read-Only auf Claims aus eigenen konvertierten Leads (Audit-Trail)
--
-- claims_sv_assigned_select und claims_kunde_via_party_select bleiben unverändert.

-- Alte Broad-Policy entfernen
DROP POLICY IF EXISTS claims_staff_all ON public.claims;

-- ── Admin: Vollzugriff ──────────────────────────────────────────────────────
CREATE POLICY claims_admin_all ON public.claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
  );

-- ── Kundenbetreuer: eigene Claims + Pool (noch nicht zugewiesen) ────────────
-- KB darf Pool-Claim übernehmen indem er kundenbetreuer_id auf sich selbst setzt.
-- WITH CHECK stellt sicher: nach dem Update ist es sein eigener Claim.
CREATE POLICY claims_kb_own_or_pool ON public.claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'kundenbetreuer')
    AND (kundenbetreuer_id = auth.uid() OR kundenbetreuer_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'kundenbetreuer')
    AND (kundenbetreuer_id = auth.uid() OR kundenbetreuer_id IS NULL)
  );

-- ── Dispatcher: Read-Only Audit auf konvertierte Claims ─────────────────────
-- Dispatcher sieht Claims, die aus seinen eigenen Leads entstanden sind.
-- Kein UPDATE — nur SELECT (reines Audit).
CREATE POLICY claims_dispatcher_audit ON public.claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'dispatch')
    AND lead_id IN (
      SELECT id FROM public.leads
       WHERE konvertiert_durch_user_id = auth.uid()
    )
  );

-- ── Kommentare ──────────────────────────────────────────────────────────────
COMMENT ON POLICY claims_admin_all ON public.claims IS
  'AAR-831: Admin Vollzugriff auf alle Claims.';
COMMENT ON POLICY claims_kb_own_or_pool ON public.claims IS
  'AAR-831: Kundenbetreuer RW auf eigene Claims und unzugewiesene Pool-Claims. '
  'Pool-Übernahme via assignKundenbetreuer() Server-Action.';
COMMENT ON POLICY claims_dispatcher_audit ON public.claims IS
  'AAR-831: Dispatcher Read-Only auf Claims aus eigenen konvertierten Leads (Audit-Trail). '
  'Kein UPDATE — nach Konversion ist Claim KB-Domäne.';
