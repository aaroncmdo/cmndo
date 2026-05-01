-- Eskalation eines Falls an einen Admin durch den KB.
--
-- Wenn ein Fall eskaliert wird, kann der zugewiesene Admin am Chat teilnehmen
-- (gruppenchat + chat_kb_kunde). Der Kunde sieht den Admin als zusaetzliche
-- Sidebar-Card (read-only, nicht direkt anchattbar/anrufbar).
--
-- NULL = nicht eskaliert (Default). Gesetzt = Admin uebernimmt mit.

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS eskaliert_an_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eskaliert_am timestamptz,
  ADD COLUMN IF NOT EXISTS eskaliert_grund text;

COMMENT ON COLUMN public.faelle.eskaliert_an_admin_id IS
  'Admin der den Fall vom KB eskaliert uebernommen hat. NULL = nicht eskaliert.';

CREATE INDEX IF NOT EXISTS idx_faelle_eskaliert_admin
  ON public.faelle (eskaliert_an_admin_id)
  WHERE eskaliert_an_admin_id IS NOT NULL;
