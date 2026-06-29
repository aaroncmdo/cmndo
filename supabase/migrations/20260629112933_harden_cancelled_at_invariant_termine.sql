-- Schicht 4 (Geist-Strecke): die cancelled_at-Invariante DB-seitig haerten.
-- (1) Source-Fix: die TTL-Cleanup-Funktion setzte status='storniert' OHNE cancelled_at
--     (Quelle der 22 storniert-ohne-cancelled_at; cancelled_at-Crons koennten Erinnerungen
--     fuer stornierte Termine senden). Jetzt cancelled_at=now() mitsetzen.
CREATE OR REPLACE FUNCTION public.expire_geblockte_termine_ohne_sa()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert', cancelled_at = now(), updated_at = now()
     WHERE status = 'reserviert'
       AND (
         (reserviert_bis IS NOT NULL AND reserviert_bis < now())               -- feine Engine-TTL
         OR (reserviert_bis IS NULL AND fall_id IS NULL                          -- grobe Legacy-Regel
             AND created_at < now() - interval '1 hour')
       )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$function$;

-- (2) DB-Garantie der Invariante "terminal-cancelled => cancelled_at": self-healing BEFORE-Trigger.
--     BEWUSST Trigger statt CHECK-Constraint: ein CHECK wuerde die AKTUELL DEPLOYTE verlege()
--     (setzt cancelled_at noch nicht; Fix in #3313 ungedeployed) beim verschoben-Write SOFORT
--     brechen -> Live-Reschedule-Fehler. Der Trigger HEILT jeden Pfad (heute + kuenftig) ohne
--     Breakage und fixt den Geist sofort in Prod (cancelled_at gesetzt -> cancelled_at-Filter greift).
--     'verlegt' (lebendes SV-Propose-Intermediate) + aktive Status bleiben unberuehrt.
CREATE OR REPLACE FUNCTION public.gutachter_termine_set_cancelled_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IN ('verschoben','storniert','abgelehnt','abgesagt')
     AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_cancelled_at_on_terminal ON public.gutachter_termine;
CREATE TRIGGER trg_set_cancelled_at_on_terminal
  BEFORE INSERT OR UPDATE ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_set_cancelled_at();
