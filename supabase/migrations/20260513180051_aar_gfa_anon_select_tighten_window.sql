-- Security-Tightening: gfa_anon_select_eigene_session war qual=true → Scraping offen.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13-DONE.md
-- Hinweis: aus PR #969 (Drift-Recovery #5) als Security-Concern eingetragen
-- und hier mit Folge-Migration geschlossen.
--
-- Vorher: `gfa_anon_select_eigene_session` (SELECT/anon+authenticated/qual=true/wc=null)
--   → jeder anon kann ALLE gutachter_finder_anfragen-Rows lesen (auch historische).
--   Use-Case ist aber nur INSERT...RETURNING — anon will gerade eingefügte Row lesen.
--
-- Nachher: `gfa_anon_select_recent_window` mit `erstellt_am > now() - interval '5 minutes'`.
--   • RETURNING funktioniert (frisch eingefügte Row ist innerhalb 5min)
--   • Historisches Scraping ist unmöglich
--   • Plus Index auf erstellt_am DESC damit der Window-Lookup effizient ist
--
-- Trade-off: anon-Client der eine Anfrage länger als 5min nach Insert nochmal
-- abrufen will → 403/0 rows. Falls das tatsächlich vorkommt: TTL erhöhen
-- oder Session-ID-Scoping (Spalte session_id ergänzen + Setting nutzen).

DROP POLICY IF EXISTS "gfa_anon_select_eigene_session" ON public.gutachter_finder_anfragen;

CREATE POLICY "gfa_anon_select_recent_window" ON public.gutachter_finder_anfragen
  FOR SELECT TO anon, authenticated
  USING (erstellt_am > (now() - interval '5 minutes'));

CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_erstellt_am_desc
  ON public.gutachter_finder_anfragen (erstellt_am DESC);
