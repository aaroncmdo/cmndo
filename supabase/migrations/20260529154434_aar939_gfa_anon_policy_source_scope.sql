-- AAR-939 · Monika-Embed · Stream 1 — SICHERHEITS-HÄRTUNG anon-Policies
-- (eigenes File, separat reviewbar — ändert bestehende gutachter_finder_anfragen-Policies)
--
-- BEFUND (29.05.2026, live verifiziert über pg_policy — NICHT aus stale types):
--   gutachter_finder_anfragen hat drei für anon offene Policies OHNE source-Scope:
--     • gfa_anon_select_recent_window  SELECT  anon+authenticated
--         USING (erstellt_am > now() - '00:05:00'::interval)        -- 5-Minuten-Fenster
--     • gfa_anon_update_entwurf        UPDATE  anon+authenticated
--         USING  (status = 'entwurf')
--         CHECK  (status = 'entwurf' OR status = 'eingegangen')
--     • gfa_insert_public              INSERT  (PUBLIC, alle Rollen)
--         CHECK  (true)
--   → Mit dem öffentlichen anon-Key kann jeder: (1) alle Anfragen der letzten 5 Min lesen
--     (Name/Telefon/Email/gclid/utm), (2) entwurf-Zeilen verändern, (3) BELIEBIGE Zeilen
--     inserten — inkl. gefälschter source='sv_embed'/variante='B' (Dispatch-/Billing-Vergiftung).
--
-- Diese Policies sind für den anonymen Mehr-Schritt-Wizard des NATIVEN Funnels gedacht.
-- Monika leitet sensible Embed-Anfragen von FREMDEN Domains in dieselbe Tabelle
-- (source IN ('sv_embed','kfz_gutachter_lp')) → ohne Scope würden diese ebenfalls
-- anon-lesbar/-fälschbar. Monika schreibt ausschließlich via service_role (Webhook,
-- bypasst RLS) und pollt die Zeile NICHT per anon zurück → der Scope kostet keine Funktion.
--
-- FIX (chirurgisch, Bestandsverhalten 1:1 erhalten, nur `source IS NULL` ergänzt):
--   Beide anon-Lese-/Schreib-Policies + die public-Insert-Policy auf `source IS NULL`
--   einschränken → nur native-Funnel-Zeilen (source=NULL) bleiben anon-zugänglich;
--   Monika-Zeilen (source NOT NULL) sind für anon unsichtbar, unveränderbar UND nicht
--   fälschbar. Bestandszeilen haben source=NULL → nativer Funnel unverändert.
--   Der native Wizard-Insert (anon, ohne source) erfüllt source IS NULL → unverändert.
--
-- Rest-Leak HINWEIS: anon liest weiterhin fremde NATIVE Anfragen der letzten 5 Min
--   (kein Owner/Session-Scope). Vorbestehende Funnel-Entscheidung, NICHT Scope von AAR-939.

DROP POLICY IF EXISTS gfa_anon_select_recent_window ON public.gutachter_finder_anfragen;
CREATE POLICY gfa_anon_select_recent_window ON public.gutachter_finder_anfragen
  FOR SELECT TO anon, authenticated
  USING (source IS NULL AND erstellt_am > now() - interval '5 minutes');

DROP POLICY IF EXISTS gfa_anon_update_entwurf ON public.gutachter_finder_anfragen;
CREATE POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen
  FOR UPDATE TO anon, authenticated
  USING (source IS NULL AND status = 'entwurf')
  WITH CHECK (source IS NULL AND (status = 'entwurf' OR status = 'eingegangen'));

DROP POLICY IF EXISTS gfa_insert_public ON public.gutachter_finder_anfragen;
CREATE POLICY gfa_insert_public ON public.gutachter_finder_anfragen
  FOR INSERT WITH CHECK (source IS NULL);

-- ── Rollback (NICHT als Migration applied) ─────────────────────────────────
-- DROP POLICY IF EXISTS gfa_anon_select_recent_window ON public.gutachter_finder_anfragen;
-- CREATE POLICY gfa_anon_select_recent_window ON public.gutachter_finder_anfragen
--   FOR SELECT TO anon, authenticated USING (erstellt_am > now() - interval '5 minutes');
-- DROP POLICY IF EXISTS gfa_anon_update_entwurf ON public.gutachter_finder_anfragen;
-- CREATE POLICY gfa_anon_update_entwurf ON public.gutachter_finder_anfragen
--   FOR UPDATE TO anon, authenticated
--   USING (status = 'entwurf') WITH CHECK (status = 'entwurf' OR status = 'eingegangen');
-- DROP POLICY IF EXISTS gfa_insert_public ON public.gutachter_finder_anfragen;
-- CREATE POLICY gfa_insert_public ON public.gutachter_finder_anfragen
--   FOR INSERT WITH CHECK (true);
