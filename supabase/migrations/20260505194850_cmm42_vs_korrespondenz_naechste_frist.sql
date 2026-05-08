-- CMM-42 (Sub-Ticket von CMM-36): naechste_frist auf vs_korrespondenz.
--
-- Ergaenzt das AAR-823-Schema um den naechsten erwarteten VS-Schritt. Wenn
-- der Mitarbeiter nach einem VS-Anruf eintraegt „VS hat zugesagt bis 20.05.
-- zu zahlen", landet diese Frist hier. Der spaetere Review-Cron (CMM-43)
-- liest die Spalte aus, um Faelle deren Frist abgelaufen ist mit hoeherer
-- Prioritaet zu eskalieren.

ALTER TABLE public.vs_korrespondenz
  ADD COLUMN IF NOT EXISTS naechste_frist TIMESTAMPTZ;

COMMENT ON COLUMN public.vs_korrespondenz.naechste_frist IS
  'CMM-42: Naechster erwarteter Schritt der Versicherung (z.B. zugesagte Zahlung). NULL = kein konkreter Folge-Termin. Wird vom CMM-43-Cron fuer prioritaerte Mitteilungen genutzt.';
