-- CMM-32e: abgelehnt_am-Marker auf fall_dokumente.
--
-- Bei jedem KB-Reject werden alle aktuell aktiven (nicht-abgelehnt, nicht-
-- gelöscht) Dokumente eines Auftrags auf abgelehnt_am=now gesetzt. Diese
-- Files sind nur noch für Admin/KB sichtbar (rote „Abgelehnt"-Sektion in
-- der QC-Card). SV/Kunde sehen nur die aktive Iteration.

ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS abgelehnt_am timestamptz;

CREATE INDEX IF NOT EXISTS idx_fall_dokumente_abgelehnt
  ON public.fall_dokumente(abgelehnt_am)
  WHERE abgelehnt_am IS NOT NULL;

COMMENT ON COLUMN public.fall_dokumente.abgelehnt_am IS
  'CMM-32e: Wenn gesetzt, gehört das Dokument zu einer abgelehnten Iteration. Nur Admin/KB sehen es; SV/Kunde sehen es nicht mehr in ihren Listen.';
