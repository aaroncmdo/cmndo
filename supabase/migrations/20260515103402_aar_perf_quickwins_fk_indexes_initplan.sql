-- Performance-Advisor Quick-Wins (15.05.2026)
--
-- Aus `get_advisors(type='performance')`-Snapshot:
--   - 4× unindexed_foreign_keys (WARN)
--   - 1× auth_rls_initplan (WARN) — profiles."Profil erstellen" mit nicht-cached auth.uid()
--
-- Verbleibend nach dieser Migration:
--   - 294× multiple_permissive_policies (WARN) — eigene Welle, große Konsolidierung
--   - 208× unused_index (INFO) — Deferral bis 2026-05-28 (siehe Memory live_rls_audit)
--   - 1× auth_db_connections_absolute (WARN) — Dashboard-Setting, kein DDL-Fix

-- ============================================================
-- 1. FK-Indexes anlegen (4 FKs ohne Index)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_community_leaderboard_sv_id
  ON public.community_leaderboard (sv_id);

CREATE INDEX IF NOT EXISTS idx_fall_read_state_fall_id
  ON public.fall_read_state (fall_id);

CREATE INDEX IF NOT EXISTS idx_ki_gespraeche_user_id
  ON public.ki_gespraeche (user_id);

CREATE INDEX IF NOT EXISTS idx_makler_fall_consent_makler_id
  ON public.makler_fall_consent (makler_id);

-- ============================================================
-- 2. profiles."Profil erstellen" — auth.uid() in (select)-Wrap
-- ============================================================
-- Aktueller with_check: `(id = auth.uid())` ohne Subquery — re-evaluiert pro Row.
-- Postgres-RLS-Pattern: `(select auth.uid())` cached den Wert via InitPlan.

ALTER POLICY "Profil erstellen"
  ON public.profiles
  WITH CHECK (id = (SELECT auth.uid()));

COMMENT ON POLICY "Profil erstellen" ON public.profiles IS
  'AAR-perf 15.05.2026: auth.uid() in (select)-Wrap für InitPlan-Caching.';
