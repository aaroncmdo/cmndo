-- AAR-711 — Cleanup duplizierter / fehlerhafter / irreführend benannter RLS-Policies
--
-- Befunde (pg_policies-Stand 2026-05-14):
--   1. incentives.incentives_all_public_consol — USING `(admin EXISTS) OR (admin EXISTS)`
--      → identische Bedingung zweimal, vermutlich aus fehlgeschlagener Konsolidierung.
--   2. incentives.incentives_select_public_consol — USING `(true OR (aktiv = true))`
--      → `true OR x = true`, faktisch jeder (auch anon) sieht alle Rows.
--   3. sla_tracking.'Admins read sla_tracking' — Name suggeriert nur admin,
--      tatsächlich abgedeckt: admin, kundenbetreuer, dispatch.
--
-- Fix: 2 saubere incentives-Policies + sla_tracking-Policy umbenennen.
-- Verwendet bestehende SECURITY-DEFINER-Helper is_admin() / is_staff() für Klarheit.
--
-- Pre-Apply: 256 public-Policies total.
-- Post-Apply: 256 (net 0 — DROPs + CREATEs heben sich auf).

-- ─────────────────────────────────────────────────────────────────────
-- 1. incentives — 2× DROP Buggy + 2× CREATE Clean
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "incentives_all_public_consol"    ON public.incentives;
DROP POLICY IF EXISTS "incentives_select_public_consol" ON public.incentives;

-- Admin: volle Verwaltung (CRUD)
CREATE POLICY "incentives_admin_all"
  ON public.incentives
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Staff (admin/kundenbetreuer/leadbearbeiter/dispatch/sachverstaendiger): liest aktive Incentives
-- Kunde sieht nichts, anon sieht nichts.
CREATE POLICY "incentives_staff_select_active"
  ON public.incentives
  FOR SELECT TO authenticated
  USING (aktiv = true AND is_staff());

-- ─────────────────────────────────────────────────────────────────────
-- 2. sla_tracking — irreführend benannte Policy umbenennen
--    Inhalt bleibt identisch (admin/kundenbetreuer/dispatch read).
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins read sla_tracking" ON public.sla_tracking;

CREATE POLICY "staff_read_sla_tracking"
  ON public.sla_tracking
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.rolle IN ('admin', 'kundenbetreuer', 'dispatch')
    )
  );
