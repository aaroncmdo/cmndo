-- Performance — PERMISSIVE-Policy-Konsolidierung Rest-Batch (10 Tabellen).
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.2)
--
-- Konsolidiert pro Tabelle die redundanten PERMISSIVE-Slots. Semantisch
-- identisch (Postgres OR-verkettet PERMISSIVE-Policies eh), aber 1 statt
-- N pro Slot → kleinerer Plan-Tree.
--
-- Affected:
--   • abrechnungen        — 3 SELECT/auth   → 1
--   • airdrop_invitations — 3 SELECT/public → 1
--   • auftraege           — 3 SELECT/public → 1
--   • claim_parties       — 3 SELECT/public → 1
--   • gutachten           — 3 ALL/public    → 1
--   • gutachten_fotos     — 3 ALL/public    → 1
--   • gutachten_positionen — 3 ALL/public   → 1
--   • gutachter_termine   — 2 ALL/public + 2 SELECT/auth → 2
--   • kanzlei_faelle      — 3 SELECT/public → 1
--   • incentive_auszahlungen — 4 Policies (2 Duplikate je Slot) → 2
--   • mitarbeiter_performance — 4 Policies (2 Duplikate je Slot) → 2

-- abrechnungen
DROP POLICY IF EXISTS "abrechnungen_select_admin" ON public.abrechnungen;
DROP POLICY IF EXISTS "abrechnungen_select_makler" ON public.abrechnungen;
DROP POLICY IF EXISTS "abrechnungen_select_sv" ON public.abrechnungen;
CREATE POLICY "abrechnungen_select_consolidated" ON public.abrechnungen
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (empfaenger_typ = 'makler'::text AND empfaenger_id IN (
      SELECT makler.id FROM public.makler WHERE makler.user_id = (SELECT auth.uid())
    ))
    OR (empfaenger_typ = 'sv'::text AND empfaenger_id IN (
      SELECT sachverstaendige.id FROM public.sachverstaendige WHERE sachverstaendige.profile_id = (SELECT auth.uid())
    ))
  );

-- airdrop_invitations
DROP POLICY IF EXISTS "airdrop_claim_party_select" ON public.airdrop_invitations;
DROP POLICY IF EXISTS "airdrop_invited_by_select" ON public.airdrop_invitations;
DROP POLICY IF EXISTS "airdrop_resulting_user_select" ON public.airdrop_invitations;
CREATE POLICY "airdrop_select_consolidated" ON public.airdrop_invitations
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.claim_parties cp
      WHERE cp.claim_id = airdrop_invitations.claim_id
        AND cp.user_id = (SELECT auth.uid()) AND cp.ist_aktiv = true)
    OR invited_by_user_id = (SELECT auth.uid())
    OR resulting_user_id = (SELECT auth.uid())
  );

-- auftraege
DROP POLICY IF EXISTS "auftraege_admin_select" ON public.auftraege;
DROP POLICY IF EXISTS "auftraege_kunde_select" ON public.auftraege;
DROP POLICY IF EXISTS "auftraege_sv_select" ON public.auftraege;
CREATE POLICY "auftraege_select_consolidated" ON public.auftraege
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role, 'kanzlei'::user_role]))
    OR EXISTS (SELECT 1 FROM public.faelle f
      WHERE f.id = auftraege.fall_id AND f.kunde_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.sachverstaendige sv
      WHERE sv.id = auftraege.sv_id AND sv.profile_id = (SELECT auth.uid()))
  );

-- claim_parties
DROP POLICY IF EXISTS "cp_co_party_select" ON public.claim_parties;
DROP POLICY IF EXISTS "cp_sv_assigned_select" ON public.claim_parties;
DROP POLICY IF EXISTS "cp_user_own_select" ON public.claim_parties;
CREATE POLICY "cp_select_consolidated" ON public.claim_parties
  FOR SELECT TO public
  USING (
    public.is_claim_user_party(claim_id)
    OR public.is_sv_for_claim(claim_id)
    OR user_id = (SELECT auth.uid())
  );

-- gutachten
DROP POLICY IF EXISTS "gutachten_admin_all" ON public.gutachten;
DROP POLICY IF EXISTS "gutachten_kb_own" ON public.gutachten;
DROP POLICY IF EXISTS "gutachten_sv_own" ON public.gutachten;
CREATE POLICY "gutachten_all_consolidated" ON public.gutachten
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR sv_id IN (SELECT sachverstaendige.id FROM public.sachverstaendige
      WHERE sachverstaendige.profile_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR sv_id IN (SELECT sachverstaendige.id FROM public.sachverstaendige
      WHERE sachverstaendige.profile_id = (SELECT auth.uid()))
  );

-- gutachten_fotos
DROP POLICY IF EXISTS "gf_admin_all" ON public.gutachten_fotos;
DROP POLICY IF EXISTS "gf_kb_own" ON public.gutachten_fotos;
DROP POLICY IF EXISTS "gf_sv_own" ON public.gutachten_fotos;
CREATE POLICY "gf_all_consolidated" ON public.gutachten_fotos
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten_fotos.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR gutachten_id IN (SELECT g.id FROM public.gutachten g
      JOIN public.sachverstaendige sv ON sv.id = g.sv_id
      WHERE sv.profile_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten_fotos.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR gutachten_id IN (SELECT g.id FROM public.gutachten g
      JOIN public.sachverstaendige sv ON sv.id = g.sv_id
      WHERE sv.profile_id = (SELECT auth.uid()))
  );

-- gutachten_positionen
DROP POLICY IF EXISTS "gp_admin_all" ON public.gutachten_positionen;
DROP POLICY IF EXISTS "gp_kb_own" ON public.gutachten_positionen;
DROP POLICY IF EXISTS "gp_sv_own" ON public.gutachten_positionen;
CREATE POLICY "gp_all_consolidated" ON public.gutachten_positionen
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten_positionen.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR gutachten_id IN (SELECT g.id FROM public.gutachten g
      JOIN public.sachverstaendige sv ON sv.id = g.sv_id
      WHERE sv.profile_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.rolle = 'admin'::user_role)
    OR EXISTS (SELECT 1 FROM public.claims c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = gutachten_positionen.claim_id AND p.rolle = 'kundenbetreuer'::user_role
        AND c.kundenbetreuer_id = (SELECT auth.uid()))
    OR gutachten_id IN (SELECT g.id FROM public.gutachten g
      JOIN public.sachverstaendige sv ON sv.id = g.sv_id
      WHERE sv.profile_id = (SELECT auth.uid()))
  );

-- gutachter_termine: ALL/public 2→1 + SELECT/auth 2→1
DROP POLICY IF EXISTS "Admins full access" ON public.gutachter_termine;
DROP POLICY IF EXISTS "SV eigene Termine" ON public.gutachter_termine;
CREATE POLICY "gutachter_termine_admin_sv_all_consolidated" ON public.gutachter_termine
  FOR ALL TO public
  USING (
    (SELECT profiles.rolle FROM public.profiles WHERE profiles.id = (SELECT auth.uid())) = 'admin'::user_role
    OR sv_id IN (SELECT sachverstaendige.id FROM public.sachverstaendige
      WHERE sachverstaendige.profile_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT profiles.rolle FROM public.profiles WHERE profiles.id = (SELECT auth.uid())) = 'admin'::user_role
    OR sv_id IN (SELECT sachverstaendige.id FROM public.sachverstaendige
      WHERE sachverstaendige.profile_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Kunde eigene Termine lesen" ON public.gutachter_termine;
DROP POLICY IF EXISTS "gutachter_termine_kunde_read" ON public.gutachter_termine;
CREATE POLICY "gutachter_termine_kunde_select_consolidated" ON public.gutachter_termine
  FOR SELECT TO authenticated
  USING (
    fall_id IN (SELECT faelle.id FROM public.faelle WHERE faelle.kunde_id = (SELECT auth.uid()))
    OR (fall_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.faelle f2
      WHERE f2.id = gutachter_termine.fall_id AND f2.claim_id IS NOT NULL
        AND public.is_claim_user_party(f2.claim_id)))
  );

-- kanzlei_faelle
DROP POLICY IF EXISTS "kanzlei_faelle_admin_select" ON public.kanzlei_faelle;
DROP POLICY IF EXISTS "kanzlei_faelle_kunde_select" ON public.kanzlei_faelle;
DROP POLICY IF EXISTS "kanzlei_faelle_sv_select" ON public.kanzlei_faelle;
CREATE POLICY "kanzlei_faelle_select_consolidated" ON public.kanzlei_faelle
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role, 'kundenbetreuer'::user_role, 'kanzlei'::user_role]))
    OR EXISTS (SELECT 1 FROM public.faelle f
      WHERE f.id = kanzlei_faelle.fall_id AND f.kunde_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.faelle f
      JOIN public.sachverstaendige sv ON sv.id = f.sv_id
      WHERE f.id = kanzlei_faelle.fall_id AND sv.profile_id = (SELECT auth.uid()))
  );

-- incentive_auszahlungen: Duplikate droppen
DROP POLICY IF EXISTS "incentive_auszahlungen_admin" ON public.incentive_auszahlungen;
DROP POLICY IF EXISTS "own_auszahlungen" ON public.incentive_auszahlungen;

-- mitarbeiter_performance: Duplikate droppen
DROP POLICY IF EXISTS "mitarbeiter_performance_admin" ON public.mitarbeiter_performance;
DROP POLICY IF EXISTS "own_performance" ON public.mitarbeiter_performance;
