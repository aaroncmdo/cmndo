-- #updates-rebuild Phase 0: abgeleitete Action-Worklist (DB-getrieben).
-- Leak-safe: nutzt auth.uid() (kein p_user_id-Param) -> liefert STRUKTURELL nur
-- die Items des aufrufenden Users. SECURITY DEFINER + auth.uid()-Scoping umgeht
-- RLS-Lese-Restriktionen auf den State-Tabellen, ohne fremde Items preiszugeben.
-- p_rolle steuert rollenspezifische Sources (z.B. dok_fehlt nur fuer kunde).
CREATE OR REPLACE FUNCTION public.get_updates_action(p_rolle text)
RETURNS TABLE (
  id uuid, typ text, modus text, prioritaet text, titel text,
  inhalt text, kontext_typ text, kontext_id uuid, source text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- offene_aufgabe (alle Rollen): aktive Tasks DES aufrufenden Users
  SELECT t.id, 'task'::text, 'action'::text, COALESCE(t.prioritaet::text, 'normal'),
         t.titel, t.beschreibung, 'claim'::text, t.claim_id, 'offene_aufgabe'::text, t.created_at
  FROM tasks t
  WHERE t.status IN ('offen','in-bearbeitung')
    AND (t.zugewiesen_an = auth.uid() OR t.empfaenger_user_id = auth.uid())
  UNION ALL
  -- dok_fehlt (nur kunde): Pflicht-Docs der EIGENEN Claims
  SELECT pd.id, 'event'::text, 'action'::text, 'hoch'::text,
         ('Dokument fehlt: ' || pd.dokument_typ)::text, pd.begruendung, 'claim'::text, pd.claim_id, 'dok_fehlt'::text, pd.created_at
  FROM pflichtdokumente pd
  JOIN claims c ON c.id = pd.claim_id
  WHERE pd.status = 'ausstehend' AND pd.pflicht = true
    AND p_rolle = 'kunde' AND c.geschaedigter_user_id = auth.uid()
  UNION ALL
  -- unbeantw_nachricht (alle Rollen): Nachrichten AN den aufrufenden User
  SELECT n.id, 'message'::text, 'action'::text, 'normal'::text,
         'Neue Nachricht'::text, left(n.nachricht, 140), 'claim'::text, n.claim_id, 'unbeantw_nachricht'::text, n.created_at
  FROM nachrichten n
  WHERE n.gelesen = false AND n.empfaenger_id = auth.uid();
$$;
