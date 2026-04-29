-- CMM-32e: QC-Reject-Felder auf auftraege.
-- Wenn KB Nachbesserung anfordert: zurueckweisung_grund + _am gesetzt.
-- Beim Re-Upload durch SV: _am wird zurückgesetzt (grund bleibt für Audit).

ALTER TABLE public.auftraege
  ADD COLUMN IF NOT EXISTS zurueckweisung_grund text,
  ADD COLUMN IF NOT EXISTS zurueckgewiesen_am timestamptz;

CREATE INDEX IF NOT EXISTS idx_auftraege_zurueckgewiesen
  ON public.auftraege(zurueckgewiesen_am)
  WHERE zurueckgewiesen_am IS NOT NULL;

COMMENT ON COLUMN public.auftraege.zurueckweisung_grund IS
  'CMM-32e: KB-Begründung bei Nachbesserung. Bleibt nach Re-Upload als Audit-Spur stehen.';
COMMENT ON COLUMN public.auftraege.zurueckgewiesen_am IS
  'CMM-32e: Wenn gesetzt, wartet der Auftrag auf SV-Korrektur. Beim erfolgreichen Re-Upload zurück auf NULL.';
