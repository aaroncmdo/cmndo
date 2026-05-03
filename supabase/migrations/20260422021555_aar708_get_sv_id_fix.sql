-- AAR-708: get_sv_id() referenzierte sachverstaendige.user_id — die Spalte
-- existiert nicht. Folge: jeder Aufruf der Function (z. B. RLS-Check
-- sv_tages_session_sv_own = sv_id=get_sv_id()) crasht in der WHERE-Clause,
-- der RLS-Verifier bekommt NULL/Error zurück und der Insert fehlt → SV
-- konnte den Field-Modus per „Tagesroute starten" nicht starten.
--
-- Symptom war eine generische „Tagesroute konnte nicht angelegt werden"-
-- Meldung in /gutachter/heute.
--
-- Fix: nur über profile_id matchen — das ist die einzige FK-Spalte zu
-- profiles. ist_parent_account-Sortierung bleibt für Mehrfach-SV-Konten
-- (z. B. Subunternehmer mit Parent + Child-Profilen) erhalten.

CREATE OR REPLACE FUNCTION public.get_sv_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM sachverstaendige
  WHERE profile_id = auth.uid()
  ORDER BY ist_parent_account ASC NULLS LAST
  LIMIT 1;
$$;
