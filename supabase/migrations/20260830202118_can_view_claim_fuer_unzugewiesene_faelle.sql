-- Befund 30.08.2026: Die Policy `claims__b1sel_au` laesst einen Kundenbetreuer
-- auch UNZUGEWIESENE Faelle sehen (`kundenbetreuer_id IS NULL`) — damit er einen
-- freien Fall ansehen und annehmen kann. `can_access_claim()` kennt diesen Zweig
-- nicht. Folge: 28 von 81 Claims sind fuer ihn in den Detail-Tabellen leer
-- (Dokumente, Termine, Nachrichten, Tasks, Timeline, …) — ohne Fehlermeldung.
--
-- Bewusst NICHT `can_access_claim()` selbst erweitert: die Funktion gatet auch
-- INSERT/UPDATE/DELETE. Zum Ansehen-und-Annehmen braucht der KB nur LESERECHT;
-- sobald er annimmt (`kundenbetreuer_id = er`), greifen seine vollen Rechte
-- ohnehin. Deshalb eine eigene Lese-Variante, an der nur die SELECT-Policies
-- haengen. Schreiben bleibt unveraendert eng.

CREATE OR REPLACE FUNCTION public.can_view_claim(p_claim_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin'::user_role, 'dispatch'::user_role))
    OR
    EXISTS (SELECT 1 FROM claims c JOIN profiles p ON p.id = auth.uid()
            WHERE c.id = p_claim_id AND p.rolle = 'kundenbetreuer'::user_role
              AND (c.kundenbetreuer_id = auth.uid() OR c.kundenbetreuer_id IS NULL));
$function$;

GRANT EXECUTE ON FUNCTION public.can_view_claim(uuid) TO authenticated, anon, service_role;

-- Die SELECT-Policies umhaengen. Die Ausdruecke werden NICHT abgetippt, sondern
-- aus der jeweils aktuellen Definition gelesen und nur der Funktionsname ersetzt —
-- so kann kein Zweig einer anderen Rolle (Kanzlei/SV/Kunde) verlorengehen.
DO $$
DECLARE r record; neu text;
BEGIN
  FOR r IN
    SELECT c.relname AS tabelle, p.polname,
           pg_get_expr(p.polqual, p.polrelid, true) AS q
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polcmd = 'r'
      AND pg_get_expr(p.polqual, p.polrelid, true) LIKE '%can_access_claim(%'
  LOOP
    neu := replace(r.q, 'can_access_claim(', 'can_view_claim(');
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.polname, r.tabelle, neu);
    RAISE NOTICE 'umgehaengt: %.%', r.tabelle, r.polname;
  END LOOP;
END $$;
