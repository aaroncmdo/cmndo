-- A v2 (Aaron 07.07.): reparaturwunsch ENTKOPPELN (assign sobald werkstatt_id gesetzt, nur
-- explizit 'fiktiv' = Auszahlung schliesst aus) + TEST-GUARD (Test/interner Claim erreicht NIE
-- eine echte Werkstatt, email-basiert analog src/lib/testdaten/interne-identitaet.ts) +
-- reparaturwunsch im Kunde-Flow zur Pflicht. KEIN neuer Backfill (Aaron: "bis dato nicht an echte").

-- 1. Test-/interne-Email-Erkennung (SSoT interne-identitaet.ts in SQL gespiegelt).
CREATE OR REPLACE FUNCTION public.ist_interne_email(p_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT p_email IS NOT NULL AND (
    lower(split_part(p_email, '@', 2)) = ANY (ARRAY[
      'claimondo.de','claimondo.test','claimondo-test.de',
      'example.com','example.org','example.net','example.de','lex-drive.com'])
    OR lower(p_email) ~ '(^|[.+_-])(test|smoke|e2e)([.+_@-]|$)'
  );
$function$;

-- 2. Trigger-Funktion v2 (ersetzt v1): entkoppelt + Test-Guard. Der Trigger selbst (BEFORE
--    INSERT OR UPDATE OF ...) bleibt unveraendert und zeigt auf diese Funktion.
CREATE OR REPLACE FUNCTION public.set_reparatur_werkstatt_from_qr()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_ws_email text;
  v_kunde_email text;
BEGIN
  IF NEW.werkstatt_id IS NOT NULL
     AND NEW.reparaturwunsch IS DISTINCT FROM 'fiktiv'
     AND NEW.reparatur_werkstatt_id IS NULL
  THEN
    SELECT email INTO v_ws_email FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
    IF NEW.geschaedigter_user_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.profiles WHERE id = NEW.geschaedigter_user_id;
    END IF;
    IF v_kunde_email IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    -- TEST-GUARD: nur zuweisen, wenn Werkstatt + Kunde dieselbe Test-Ness haben.
    -- (echte Werkstatt <-> Test-Claim wird so ausgeschlossen, und umgekehrt.)
    IF public.ist_interne_email(v_ws_email) = public.ist_interne_email(v_kunde_email) THEN
      NEW.reparatur_werkstatt_id := NEW.werkstatt_id;
      NEW.reparatur_werkstatt_quelle := 'qr_referral';
      NEW.reparatur_werkstatt_zugewiesen_am := COALESCE(NEW.reparatur_werkstatt_zugewiesen_am, now());
      NEW.reparatur_vermittlung_status := 'vermittelt';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. reparaturwunsch im Kunde-Flow zur Pflicht (jeder Kunde antwortet -> Finder lebt + A greift).
UPDATE public.onboarding_felder SET pflicht = true WHERE feld_key = 'reparaturwunsch';
