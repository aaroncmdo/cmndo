-- BUG-91: Profil-Tab fuer Solo-SVs muss Firmen-Stammdaten editierbar machen.
-- Diese Felder existieren bereits auf der `organisationen` Tabelle (fuer Bueros)
-- aber NICHT auf `sachverstaendige` direkt. Solo-SVs haben keine organisationen-
-- Zeile, also brauchen wir die Felder hier zusaetzlich.
--
-- Die Felder werden vom SoloAnlegenWizard zwar entgegengenommen, aber bisher
-- in actions.ts beim Insert verworfen (pre-existing Bug, nicht Teil dieses
-- Patches). Mit diesem Patch koennen sie zumindest via Profil-Tab nachgepflegt
-- werden.

ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS firmenname TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS rechtsform TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS steuernummer TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS ust_id TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS hrb TEXT;

-- Kein Index, kein Constraint - rein deskriptive Felder.
