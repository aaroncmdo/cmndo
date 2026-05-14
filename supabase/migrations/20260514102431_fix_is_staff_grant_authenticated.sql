-- 2026-05-14: is_staff() + is_admin() haben EXECUTE-Grant nur für postgres +
-- service_role, NICHT für authenticated. Portal-Guard ruft die Funktion aber
-- aus dem User-Kontext (auth.uid()) und bekommt seit irgendwann "permission
-- denied for function is_staff". Portal-Login crasht und SVs sehen
-- /login?error=Profil+nicht+ladbar.
--
-- SECURITY DEFINER bleibt — die Funktion läuft als postgres und sieht
-- profiles, aber der Caller muss EXECUTE haben.

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Sicher fürs Fall dass weitere RLS-Helpers auch geblockt sind.
DO $$
DECLARE
  fname text;
BEGIN
  FOR fname IN
    SELECT proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('is_dispatcher', 'is_kundenbetreuer', 'is_sachverstaendiger', 'is_kunde', 'can_access_fall')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated', fname);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.is_staff IS
  'CMM-23 + 2026-05-14: leadbearbeiter-Branch entfernt; EXECUTE fuer authenticated explizit gegranted.';
