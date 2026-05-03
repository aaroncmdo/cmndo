-- CMM-32: Cron-Fallback für durchgefuehrt_am.
--
-- Hauptmechanismus ist Geofence-Out (SV >2 km vom Ziel = Termin durchgeführt,
-- siehe useGeoPosition). Falls der SV die App geschlossen hat und sich nicht
-- mehr live meldet, fängt dieser Cron den vergessenen Termin ab.
--
-- Lauft alle 15 Min, markiert Termine wo:
--   end_zeit + 30 min in der Vergangenheit
--   sv_angekommen_am gesetzt (SV war wirklich vor Ort)
--   durchgefuehrt_am noch null
--
-- Trigger spiegelt dann automatisch auftraege.status='gutachten'.

CREATE OR REPLACE FUNCTION public.cron_mark_durchgefuehrt_fallback() RETURNS void AS $$
BEGIN
  UPDATE public.gutachter_termine
  SET durchgefuehrt_am = NOW()
  WHERE durchgefuehrt_am IS NULL
    AND sv_angekommen_am IS NOT NULL
    AND end_zeit < NOW() - INTERVAL '30 minutes'
    AND typ = 'sv_begutachtung';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cron_mark_durchgefuehrt_fallback IS
  'CMM-32: Cron-Fallback wenn Geofence-Out via App nicht greift (App geschlossen). End-Zeit + 30 min Puffer.';

-- Cron-Schedule
SELECT cron.schedule(
  'cmm32_durchgefuehrt_fallback',
  '*/15 * * * *',
  $$ SELECT public.cron_mark_durchgefuehrt_fallback(); $$
);
