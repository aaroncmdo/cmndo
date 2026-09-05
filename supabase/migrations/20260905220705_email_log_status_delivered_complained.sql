-- Zustellnachweis fuer transaktionale Mails (Kasko-WB Phase 2, Aaron 05.09.2026).
--
-- Befund: Resend liefert Zustell-Ereignisse per Webhook, und der Webhook laeuft nachweislich
-- (cold_mail_sends traegt 'zugestellt'/'geklickt'). Fuer TRANSAKTIONALE Mails wirft er sie aber weg:
-- er sucht das Ereignis nur in cold_mail_sends und antwortet sonst 'kein_cold_mail_send'.
-- Ergebnis auf prod: 542 Mails in 30 Tagen stehen auf 'sent', KEINE einzige auf zugestellt —
-- ein Bounce an eine falsche Kundenadresse ist heute unsichtbar.
--
-- Der CHECK kannte bisher nur pending/sent/failed/bounced. Fuer den Webhook-Pfad fehlen die beiden
-- Zustaende, die Resend meldet: 'delivered' (Zustellung bestaetigt) und 'complained' (als Spam markiert).
-- REIHENFOLGE (AGENTS.md Flag-Drift-Gate): erst der CHECK, DANN der Code, DANN der Snapshot —
-- andernfalls verwirft Postgres die Werte still.
ALTER TABLE public.email_log DROP CONSTRAINT IF EXISTS email_log_status_check;

ALTER TABLE public.email_log
  ADD CONSTRAINT email_log_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'bounced'::text, 'complained'::text]));

COMMENT ON COLUMN public.email_log.status IS
  'pending -> sent (an den Provider uebergeben) -> delivered (Resend-Webhook: Zustellung bestaetigt). failed = Uebergabe scheiterte; bounced/complained = Resend-Webhook, terminal. Nur aufwaerts schreiben (Webhooks kommen out-of-order und werden retried).';