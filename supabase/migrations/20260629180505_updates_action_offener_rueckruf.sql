-- #updates-rebuild Phase 4: +Action-Source offener_rueckruf (dispatch-Callback-Queue).
-- Offene Rueckruf-Termine (admin_termine typ='rueckruf' status='offen') werden als
-- typ='call'-Action sichtbar -> dispatch sieht seine Callback-Queue in der Bell.
-- Auto-Resolve: status wechselt (erledigt) -> Item verschwindet. dispatch-weit
-- (kein zugewiesen_an-Filter, spiegelt /dispatch/rueckrufe). Leak-safe via derived role.
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
  -- offener_rueckruf (dispatch): offene Callback-Termine, dispatch-weit (shared queue)
  SELECT at.id, 'call'::text, 'action'::text,
         (CASE WHEN at.start_zeit < now() THEN 'dringend' ELSE 'hoch' END)::text,
         at.titel, at.beschreibung, 'rueckruf'::text, at.id, 'offener_rueckruf'::text, at.created_at
  FROM admin_termine at CROSS JOIN me
  WHERE at.typ = 'rueckruf' AND at.status = 'offen' AND at.lead_id IS NOT NULL
    AND me.rolle = 'dispatch';
$$;
