-- Nurture-Tuning (Follow-up 1): Timeout-Fenster 7 -> 10 Tage, damit der 4. Reminder (Tag 7) wirken kann.
CREATE OR REPLACE FUNCTION public.mark_expired_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  UPDATE leads
  SET
    status                    = 'disqualifiziert',
    disqualifiziert           = true,
    disqualifiziert_grund     = 'Timeout nach 10 Tagen ohne Konvertierung',
    disqualifiziert_grund_key = 'timeout',
    updated_at                = now()
  WHERE
    status          = 'neu'
    AND disqualifiziert = false
    AND created_at  < now() - INTERVAL '10 days';
END;
$function$;
