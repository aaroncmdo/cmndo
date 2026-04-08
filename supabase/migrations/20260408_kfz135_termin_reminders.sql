-- KFZ-135: Termin-Reminder Backend (standalone, Hooks in KFZ-136)
-- Tabellen fuer automatische WhatsApp-Erinnerungen an Kunde + SV

CREATE TABLE IF NOT EXISTS termin_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termin_id UUID NOT NULL REFERENCES gutachter_termine(id) ON DELETE CASCADE,
  empfaenger TEXT NOT NULL CHECK (empfaenger IN ('kunde','sv')),
  reminder_typ TEXT NOT NULL CHECK (reminder_typ IN ('kunde_morgen','kunde_1h','sv_route')),
  geplant_fuer TIMESTAMPTZ NOT NULL,
  versendet_am TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  fehler TEXT NULL,
  versuche INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(termin_id, reminder_typ)
);

CREATE INDEX IF NOT EXISTS idx_termin_reminders_pending
  ON termin_reminders(geplant_fuer, status) WHERE status = 'pending';

-- RLS
ALTER TABLE termin_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "termin_reminders_service_only" ON termin_reminders
  FOR ALL USING (auth.role() = 'service_role');

-- Routing-Cache fuer OSRM Fahrtzeiten
CREATE TABLE IF NOT EXISTS routing_cache (
  von_hash TEXT NOT NULL,
  nach_hash TEXT NOT NULL,
  fahrtzeit_sek INTEGER NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (von_hash, nach_hash)
);

CREATE INDEX IF NOT EXISTS idx_routing_cache_age ON routing_cache(cached_at);

-- RLS
ALTER TABLE routing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "routing_cache_service_only" ON routing_cache
  FOR ALL USING (auth.role() = 'service_role');
