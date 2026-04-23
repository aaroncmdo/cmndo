-- AAR-724: Neuer Termin/Rückruf = roter Punkt + Zähler in der Navbar.
-- Spalte gesehen_am wird erst gesetzt, wenn der verantwortliche User
-- (SV bzw. Dispatch) das Detail öffnet oder per Server-Action explizit
-- „gesehen" markiert. NULL = neu/ungelesen, Timestamp = bereits gesehen.

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS gesehen_am timestamptz NULL;

ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS gesehen_am timestamptz NULL;

COMMENT ON COLUMN public.gutachter_termine.gesehen_am IS
  'AAR-724: Zeitpunkt, zu dem der SV den Termin angesehen hat. NULL = noch nicht gesehen (rote Markierung + Counter in Navbar).';

COMMENT ON COLUMN public.admin_termine.gesehen_am IS
  'AAR-724: Zeitpunkt, zu dem der zugewiesene Dispatcher/Admin den Termin/Rückruf angesehen hat. NULL = noch nicht gesehen.';

-- Index für die Counter-Query (häufige Reads aus der Navbar-Badge).
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_sv_gesehen
  ON public.gutachter_termine(sv_id)
  WHERE gesehen_am IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_termine_zugewiesen_gesehen
  ON public.admin_termine(zugewiesen_an)
  WHERE gesehen_am IS NULL;
