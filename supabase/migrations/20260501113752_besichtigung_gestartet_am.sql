-- Auto-Arrive Trigger: besichtigung_gestartet_am als DB-Single-Source-of-Truth.
--
-- Hintergrund: Bisher hingen "Besichtigung läuft"-Anzeigen nur am SV-Termin
-- (gutachter_termine.sv_angekommen_am) und an der lokalen sessionStatus-State-
-- Machine im FeldmodusClient. Der Kunde sah davon NICHTS — auf der Kunden-
-- Tracking-Seite blieb nur "{SV} ist da!" bestehen, ohne dass der eigentliche
-- Trigger ("die Besichtigung hat begonnen") als gemeinsames Signal in der DB
-- lag. Jetzt: Auto-Arrive (Geofence beider Seiten ODER Zeit-Fallback) schreibt
-- besichtigung_gestartet_am auf gutachter_termine UND faelle. Beide Portale
-- (SV-Feldmodus + Kunden-Tracking) konsumieren diese Spalte über Realtime.
--
-- Warum redundant auf faelle? Damit Fallakte/Admin-Übersicht ohne Termin-Join
-- erkennen können, dass eine Besichtigung läuft (z.B. Status-Badge "Besichtigung
-- läuft" in der Akten-Liste).

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS besichtigung_gestartet_am timestamptz;

COMMENT ON COLUMN public.gutachter_termine.besichtigung_gestartet_am IS
  'Auto-Arrive-Trigger. Wird gesetzt wenn beide Parteien am Besichtigungsort '
  'sind (Geofence) oder als Fallback wenn die Terminuhrzeit erreicht ist. '
  'Quelle für die "Besichtigung läuft"-Anzeige in SV- und Kunden-Portal.';

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS besichtigung_gestartet_am timestamptz;

COMMENT ON COLUMN public.faelle.besichtigung_gestartet_am IS
  'Denormalisiert aus gutachter_termine.besichtigung_gestartet_am des aktiven '
  'sv_begutachtung-Termins. Wird beim Auto-Arrive synchron geschrieben.';

CREATE INDEX IF NOT EXISTS idx_gutachter_termine_besichtigung_gestartet
  ON public.gutachter_termine (besichtigung_gestartet_am)
  WHERE besichtigung_gestartet_am IS NOT NULL;
