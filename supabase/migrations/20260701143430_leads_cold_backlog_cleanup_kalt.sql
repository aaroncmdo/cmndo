-- #lead-hygiene: Alt-Stau (Vor-Fix-Backlog, Mai) auf 'kalt' schliessen.
-- Kontext: Lead-Zuweisung war Mai kaputt (0-1%), Anfang Juni gefixt (pick-dispatcher,
-- AAR-956) -> seither ~100%. Die 160 offenen unassigned Leads sind der historische
-- kalte Rest (Flow-Link Mai raus, nie abgeschlossen, >30d unangetastet). Beide
-- Lifecycle-Achsen (status + qualifizierungs_phase) = 'kalt' fuer konsistente
-- Sichtbarkeit (status-basierte UND phase-basierte Consumer verstecken sie dann).
-- Fixe Datumsgrenzen (reproduzierbar, nicht now()-relativ). Einmal-Cleanup.
UPDATE public.leads
SET status = 'kalt', qualifizierungs_phase = 'kalt'
WHERE flow_link_abgeschlossen = false
  AND status::text IN ('flow-gesendet','quali-offen')
  AND created_at < '2026-06-01'
  AND updated_at < '2026-06-17';

-- offener_lead (Bell) darf 'kalt' nicht mehr zeigen -> aus dem Verlauf raus.
CREATE OR REPLACE FUNCTION public.get_updates_action(p_rolle text)
RETURNS TABLE (
  id uuid, typ text, modus text, prioritaet text, titel text,
  inhalt text, kontext_typ text, kontext_id uuid, source text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid,
           (SELECT p.rolle::text FROM profiles p WHERE p.id = auth.uid()) AS rolle
  )
  SELECT t.id, 'task'::text, 'action'::text,
         (CASE
            WHEN t.prioritaet::text IN ('kritisch','dringend') THEN 'dringend'
            WHEN t.prioritaet::text = 'hoch' THEN 'hoch'
            ELSE 'normal'
          END)::text,
         t.titel, t.beschreibung, 'claim'::text, t.claim_id, 'offene_aufgabe'::text, t.created_at
  FROM tasks t CROSS JOIN me
  WHERE t.status IN ('offen','in-bearbeitung')
    AND (
      t.zugewiesen_an = me.uid
      OR t.empfaenger_user_id = me.uid
      OR (
        t.zugewiesen_an IS NULL AND t.empfaenger_user_id IS NULL
        AND t.empfaenger_rolle IS NOT NULL AND me.rolle IS NOT NULL
        AND (
          t.empfaenger_rolle = me.rolle
          OR (me.rolle = 'sachverstaendiger' AND t.empfaenger_rolle = 'gutachter')
        )
      )
    )
  UNION ALL
  SELECT pd.id, 'event'::text, 'action'::text, 'hoch'::text,
         ('Dokument fehlt: ' || pd.dokument_typ)::text, pd.begruendung, 'claim'::text, pd.claim_id, 'dok_fehlt'::text, pd.created_at
  FROM pflichtdokumente pd JOIN claims c ON c.id = pd.claim_id CROSS JOIN me
  WHERE pd.status = 'ausstehend' AND pd.pflicht = true
    AND me.rolle = 'kunde' AND c.geschaedigter_user_id = me.uid
  UNION ALL
  SELECT n.id, 'message'::text, 'action'::text, 'normal'::text,
         'Neue Nachricht'::text, left(n.nachricht, 140), 'claim'::text, n.claim_id, 'unbeantw_nachricht'::text, n.created_at
  FROM nachrichten n CROSS JOIN me
  WHERE n.gelesen = false AND n.empfaenger_id = me.uid
  UNION ALL
  SELECT sv.id, 'event'::text, 'action'::text,
         (CASE WHEN sv.verifizierung_status::text = 'frist_ueberschritten' THEN 'dringend' ELSE 'hoch' END)::text,
         'Verifizierung abschließen'::text,
         'Deine SV-Verifizierung steht noch aus.'::text,
         NULL::text, NULL::uuid, 'sv_verifizierung_offen'::text, now()
  FROM sachverstaendige sv CROSS JOIN me
  WHERE me.rolle = 'sachverstaendiger' AND sv.profile_id = me.uid
    AND sv.verifizierung_status::text IN ('ausstehend','frist_ueberschritten')
  UNION ALL
  SELECT at.id, 'call'::text, 'action'::text,
         (CASE WHEN at.start_zeit < now() THEN 'dringend' ELSE 'hoch' END)::text,
         at.titel, at.beschreibung, 'rueckruf'::text, at.id, 'offener_rueckruf'::text, at.created_at
  FROM admin_termine at CROSS JOIN me
  WHERE at.typ = 'rueckruf' AND at.status = 'offen' AND at.lead_id IS NOT NULL
    AND me.rolle IN ('dispatch','admin')
  UNION ALL
  -- offener_lead (dispatch+admin): offene Leads als INFO; 'kalt' jetzt ausgeschlossen
  SELECT l.id, 'event'::text, 'info'::text, 'normal'::text,
         ('Lead: ' || COALESCE(NULLIF(btrim(COALESCE(l.vorname,'') || ' ' || COALESCE(l.nachname,'')), ''), 'ohne Name'))::text,
         (l.status::text || COALESCE(' · ' || l.source_channel, ''))::text,
         'lead'::text, l.id, 'offener_lead'::text, l.created_at
  FROM leads l CROSS JOIN me
  WHERE me.rolle IN ('dispatch','admin')
    AND l.flow_link_abgeschlossen = false
    AND l.status::text NOT IN ('disqualifiziert','umgewandelt','umgewandelt-sv','kalt');
$$;
