-- Storno-Policy fuer den DSGVO-Selbstbedienungs-Loeschantrag.
--
-- Befund (Regel-4-Prod-Smoke 19.07., Session 8c6de199): die Tabelle hatte NUR
-- INSERT- + SELECT-Policies. storniereLoeschAntrag() schreibt aber ueber den
-- RLS-Client (SSR) -> das UPDATE traf 0 Rows, und fuer ein 0-Row-UPDATE meldet
-- PostgREST KEINEN Fehler -> die Action gab { ok: true } zurueck, die Card rief
-- setAuftrag(null) und verschwand, der Loeschantrag blieb aber aktiv.
-- Live gegen prod bewiesen (Rolle authenticated + echtes JWT-sub, danach Rollback):
--   SELECT_sichtbar=1 | UPDATE_rows=0 | UPDATE_error=keiner
-- Betrifft alle 4 Portale mit DsgvoLoeschCard (Kunde/Makler/Werkstatt/SV);
-- die UI verspricht das Storno explizit ("14-Tage-Karenz, in der Sie den Antrag
-- noch stornieren koennen").
--
-- USING      = WELCHE Zeilen darf der User anfassen (nur eigene, nur stornierbare)
-- WITH CHECK = WIE darf die Zeile danach aussehen (nur -> 'storniert'; kein
--              Selbst-Bestaetigen/-Ausfuehren)
CREATE POLICY dsgvo_loesch_self_storno ON public.dsgvo_loeschauftraege
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status IN ('eingereicht', 'bestaetigt')
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'storniert'
  );

-- Spalten-Cap: RLS begrenzt ZEILEN, nicht SPALTEN. Ohne den Cap koennte der User
-- beim Storno auch audit_payload/bestaetigt_am/email seiner eigenen Zeile
-- ueberschreiben. Einziger RLS-Client-Writer ist storniereLoeschAntrag(), und der
-- schreibt ausschliesslich `status` (die Admin-Pfade bestaetigeLoeschAntrag/
-- fuehreLoeschungAus laufen ueber service_role und sind davon unberuehrt).
REVOKE UPDATE ON public.dsgvo_loeschauftraege FROM authenticated;
GRANT UPDATE (status) ON public.dsgvo_loeschauftraege TO authenticated;
