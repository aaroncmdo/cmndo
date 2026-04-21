-- AAR-625: ticket_typ Spalte zu support_ticket_log hinzufügen.
-- Ermöglicht getrenntes Rate-Limiting für Feature-Requests (3/Tag)
-- vs. Bug-Reports (10/Stunde).

ALTER TABLE public.support_ticket_log
  ADD COLUMN IF NOT EXISTS ticket_typ text
    CHECK (ticket_typ IN ('bug', 'feature', 'comment', 'no_action'))
    DEFAULT 'bug';

-- Bestehende Zeilen klassifizieren
UPDATE public.support_ticket_log
SET ticket_typ = CASE
  WHEN action_type = 'comment' THEN 'comment'
  WHEN action_type = 'no_action' THEN 'no_action'
  ELSE 'bug'
END
WHERE ticket_typ IS NULL OR ticket_typ = 'bug';

COMMENT ON COLUMN public.support_ticket_log.ticket_typ IS
  'AAR-625: bug | feature | comment | no_action. Basis für Feature-Request-Tageslimit (3/Tag).';