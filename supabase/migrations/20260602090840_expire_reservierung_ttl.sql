-- P2.3a: zentrale Reservierungs-Expiry. Erweitert die CMM-25-Funktion (genutzt vom Cron
-- cmm25-expire-geblockte-termine, */5) um die FEINE reserviert_bis-TTL der Engine — DRY,
-- kein zweiter Cron. Bestehende grobe Regel (fall_id NULL + created_at>1h) bleibt als
-- Fallback fuer Reservierungen OHNE reserviert_bis (Legacy). Beide flippen -> 'storniert'.
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
       SET status = 'storniert', updated_at = now()
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
