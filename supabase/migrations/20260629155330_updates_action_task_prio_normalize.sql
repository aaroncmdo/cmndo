-- #updates-rebuild Phase 4 Smoke-Fix: offene_aufgabe normalisiert die freie tasks.prioritaet
-- ('kritisch','dringend','normal') in den 3-Stufen-UI-Contract (normal|hoch|dringend).
-- Vorher leakte raw 'kritisch' in den Contract -> Bell wurde nicht rot, NaN-Sort.
CREATE OR REPLACE FUNCTION public.get_updates_action(p_rolle text)
RETURNS TABLE (
  id uuid, typ text, modus text, prioritaet text, titel text,
  inhalt text, kontext_typ text, kontext_id uuid, source text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, 'task'::text, 'action'::text,
         (CASE
            WHEN t.prioritaet::text IN ('kritisch','dringend') THEN 'dringend'
            WHEN t.prioritaet::text = 'hoch' THEN 'hoch'
            ELSE 'normal'
          END)::text,
         t.titel, t.beschreibung, 'claim'::text, t.claim_id, 'offene_aufgabe'::text, t.created_at
  FROM tasks t
  WHERE t.status IN ('offen','in-bearbeitung')
    AND (t.zugewiesen_an = auth.uid() OR t.empfaenger_user_id = auth.uid())
  UNION ALL
  SELECT pd.id, 'event'::text, 'action'::text, 'hoch'::text,
         ('Dokument fehlt: ' || pd.dokument_typ)::text, pd.begruendung, 'claim'::text, pd.claim_id, 'dok_fehlt'::text, pd.created_at
  FROM pflichtdokumente pd
  JOIN claims c ON c.id = pd.claim_id
  WHERE pd.status = 'ausstehend' AND pd.pflicht = true
    AND p_rolle = 'kunde' AND c.geschaedigter_user_id = auth.uid()
  UNION ALL
  SELECT n.id, 'message'::text, 'action'::text, 'normal'::text,
         'Neue Nachricht'::text, left(n.nachricht, 140), 'claim'::text, n.claim_id, 'unbeantw_nachricht'::text, n.created_at
  FROM nachrichten n
  WHERE n.gelesen = false AND n.empfaenger_id = auth.uid()
  UNION ALL
  -- sv_verifizierung_offen (sachverstaendiger): eigene ausstehende/ueberfaellige Verifizierung
  SELECT sv.id, 'event'::text, 'action'::text,
         (CASE WHEN sv.verifizierung_status::text = 'frist_ueberschritten' THEN 'dringend' ELSE 'hoch' END)::text,
         'Verifizierung abschließen'::text,
         'Deine SV-Verifizierung steht noch aus.'::text,
         NULL::text, NULL::uuid, 'sv_verifizierung_offen'::text, now()
  FROM sachverstaendige sv
  WHERE p_rolle = 'sachverstaendiger' AND sv.profile_id = auth.uid()
    AND sv.verifizierung_status::text IN ('ausstehend','frist_ueberschritten');
$$;
