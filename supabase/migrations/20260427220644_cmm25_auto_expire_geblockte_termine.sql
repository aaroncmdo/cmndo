-- CMM-25: Auto-Expire für vom Dispatcher geblockte Termine ohne SA-Unterschrift.
--
-- Hintergrund: Wenn der Dispatcher beim Lead-Dispatch einen SV-Slot blockt
-- (`reserveSvTerminForLead`), legt das einen `gutachter_termine`-Row mit
-- `lead_id`, `status='reserviert'` und ohne `fall_id` an. Erst wenn der Kunde
-- im FlowLink die Sicherungsabtretung unterschreibt, upgraded
-- `flow/[token]/actions.ts` den Row auf `fall_id` (Slot wird final).
--
-- Damit ein vom Dispatcher geblockter Slot nicht ewig den SV-Kalender belegt,
-- läuft alle 5 Minuten ein Job: jeden `reserviert`-Row ohne `fall_id`, der
-- älter als 1 Stunde ist, auf `storniert` setzen. SV-Slot ist wieder frei.
--
-- Sobald `fall_id` gesetzt ist (= SA unterschrieben), greift der Job nicht
-- mehr — der Termin gilt als final.

CREATE OR REPLACE FUNCTION public.expire_geblockte_termine_ohne_sa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.gutachter_termine
       SET status = 'storniert',
           updated_at = now()
     WHERE status = 'reserviert'
       AND fall_id IS NULL
       AND created_at < now() - interval '1 hour'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_geblockte_termine_ohne_sa() IS
  'CMM-25: Storniert vom Dispatcher geblockte Termine, die nach 1h noch keine SA-Unterschrift erhalten haben (fall_id IS NULL).';

-- Cron-Eintrag: alle 5 Minuten. Idempotent: vorhandenen Job löschen und neu anlegen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cmm25-expire-geblockte-termine') THEN
    PERFORM cron.unschedule('cmm25-expire-geblockte-termine');
  END IF;
END $$;

SELECT cron.schedule(
  'cmm25-expire-geblockte-termine',
  '*/5 * * * *',
  $$SELECT public.expire_geblockte_termine_ohne_sa();$$
);
