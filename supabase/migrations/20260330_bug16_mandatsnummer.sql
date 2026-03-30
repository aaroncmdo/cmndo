-- BUG-16: Mandatsnummer fuer Faelle (Format: CLM-2026-XXXX)
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS mandatsnummer TEXT UNIQUE;
