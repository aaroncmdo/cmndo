-- CMM-32: Trigger zurückrollen — status='abgeschlossen' hatte den Termin
-- aus den aktiven Listen-Filtern (SV-Fallseite, Kunde-Termin-Card) gekickt,
-- weil diese auf ['reserviert','bestaetigt','gegenvorschlag','verschoben']
-- filtern. Termin „verschwand" sobald durchgefuehrt_am gesetzt war.
--
-- Neuer Ansatz: durchgefuehrt_am ist alleinige Wahrheit für „besichtigt".
-- Kalender-Views rendern den Haken direkt aus diesem Feld; status bleibt
-- semantisch „bestaetigt" bis zur expliziten Stornierung.

DROP TRIGGER IF EXISTS termin_status_durchgefuehrt ON public.gutachter_termine;
DROP FUNCTION IF EXISTS public.tg_termin_status_durchgefuehrt();

-- Backfill rückgängig: Termine die durch den Trigger auf 'abgeschlossen'
-- gesetzt wurden, aber sv_angekommen_am UND durchgefuehrt_am haben
-- (d.h. der Trigger war der Auslöser), wieder auf 'bestaetigt'.
UPDATE public.gutachter_termine
SET status = 'bestaetigt'
WHERE status = 'abgeschlossen'
  AND durchgefuehrt_am IS NOT NULL
  AND sv_angekommen_am IS NOT NULL
  AND cancelled_at IS NULL;
