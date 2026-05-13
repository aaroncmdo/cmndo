-- DRIFT-RECOVERY (rekonstruiert 13.05.2026 17:18) — Migration appliziert
-- via MCP `apply_migration` ohne lokales Repo-File (Regel-2-Drift).
--
-- Rekonstruktion basiert auf:
--   • Migration-Name: "explicit_anon_insert_policy"
--   • Live-Endstand: kein `gfa_insert_anon` Policy vorhanden →
--     diese Migration wurde durch 20260513171346 ersetzt/aufgehoben.
--
-- Hintergrund: Zwischenstand-Experiment. Vermutlich wollte die Session eine
-- explizite anon-INSERT-Policy schaffen, hat aber später realisiert dass
-- `gfa_insert_public` (TO public, das inkludiert anon) bereits ausreicht.
-- Diese Policy wurde dann durch die nachfolgende Migration gelöscht.
--
-- Idempotenz: DROP IF EXISTS am Anfang macht das auch beim Re-Apply safe.

DROP POLICY IF EXISTS "gfa_insert_anon" ON public.gutachter_finder_anfragen;

CREATE POLICY "gfa_insert_anon" ON public.gutachter_finder_anfragen
  FOR INSERT TO anon
  WITH CHECK (true);
