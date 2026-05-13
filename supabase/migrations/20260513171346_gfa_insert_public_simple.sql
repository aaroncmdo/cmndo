-- DRIFT-RECOVERY (rekonstruiert 13.05.2026 17:18) — Migration appliziert
-- via MCP `apply_migration` ohne lokales Repo-File (Regel-2-Drift).
--
-- Rekonstruktion basiert auf:
--   • Migration-Name: "insert_public_simple"
--   • Live-Endstand: 1 Policy `gfa_insert_public` (INSERT/public/qual=null/wc=true)
--   • Pre-State (Annahme): `gfa_insert_anon` aus 171249 plus altes `gfa_insert_public`
--
-- Hintergrund: Aufräumen — drop `gfa_insert_anon` (Zwischenstand-Versuch),
-- stelle sicher dass `gfa_insert_public` in der einfachen Form vorliegt
-- (anyone may INSERT, content unbeschränkt — Lead-Capture-Form).
--
-- Idempotenz: DROP IF EXISTS macht das auch beim Re-Apply safe.
-- WICHTIG: `gfa_insert_public` existierte schon vor der Drift-Welle — das
-- ist also kein "neu" sondern eine Wiederherstellung des Soll-Stands.

DROP POLICY IF EXISTS "gfa_insert_anon" ON public.gutachter_finder_anfragen;
DROP POLICY IF EXISTS "gfa_insert_public" ON public.gutachter_finder_anfragen;

CREATE POLICY "gfa_insert_public" ON public.gutachter_finder_anfragen
  FOR INSERT TO public
  WITH CHECK (true);
