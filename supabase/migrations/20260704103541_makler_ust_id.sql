-- Makler USt-IdNr fuer die Provisions-Rechnung (Makler stellt Claimondo eine Rechnung
-- ueber seine freigegebenen Provisionen). Nullable — wird in den Einstellungen erfasst
-- und in die Rechnungs-PDF vorausgefuellt.
ALTER TABLE public.makler ADD COLUMN IF NOT EXISTS ust_id text;
COMMENT ON COLUMN public.makler.ust_id IS 'USt-IdNr des Maklers (fuer die Provisions-Rechnung). Wird in /makler/einstellungen erfasst.';
