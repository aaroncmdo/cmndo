-- DRIFT-RECOVERY (rekonstruiert 13.05.2026 17:22) — Migration appliziert
-- via MCP `apply_migration` ohne lokales Repo-File (Regel-2-Drift,
-- 5. Welle der GFA-Session).
--
-- Rekonstruktion basiert auf:
--   • Migration-Name: "anon_select_for_returning"
--   • Live-Endstand: Policy `gfa_anon_select_eigene_session`
--     (SELECT/anon+authenticated/qual=true/with_check=null)
--
-- Hintergrund: Postgres-Returning nach INSERT braucht SELECT-Privileg.
-- Da `gfa_insert_public` (INSERT/wc=true) anon INSERT erlaubt aber
-- gfa_admin_select nur für admin SELECT erlaubt, würde
-- INSERT...RETURNING aus anon-Sicht 0 Rows liefern. Diese Policy gibt
-- anon Lese-Zugriff auf alle Rows.
--
-- ⚠️ SECURITY-CONCERN: `qual=true` für anon+authenticated bedeutet
-- **jeder kann ALLE gutachter_finder_anfragen-Rows lesen** — auch
-- die von anderen Anfragenden. Das hebelt Audit §1 (RLS qual=true)
-- für diese Tabelle wieder aus. Mögliche Tightening-Optionen:
--   1. Scope auf Session-ID (z.B. `session_id = current_setting('app.session_id', true)`)
--   2. Scope auf erstellt_am > now() - interval '5 minutes' (kurzes Lese-Fenster)
--   3. Nur in einer separaten "select returning"-Policy via INSERT...RETURNING-Trick
-- Bleibt als Backlog-Item für Folge-Hardening-Welle. Behoben wird hier
-- nur die Drift, nicht das Security-Concern.

DROP POLICY IF EXISTS "gfa_anon_select_eigene_session" ON public.gutachter_finder_anfragen;

CREATE POLICY "gfa_anon_select_eigene_session" ON public.gutachter_finder_anfragen
  FOR SELECT TO anon, authenticated
  USING (true);
