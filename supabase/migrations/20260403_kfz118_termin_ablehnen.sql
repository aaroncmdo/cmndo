-- KFZ-118: Termin-Ablehnen Logik
-- gutachter_termin_status erweitern (Spalte existiert bereits aus vorheriger Migration)
-- Werte: reserviert, bestaetigt, abgelehnt, abgesagt, verschoben, abgeschlossen

-- Sicherheitstoken fuer Ablehnen-Link
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS ablehnen_token UUID DEFAULT gen_random_uuid();
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS abgelehnt_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS abgelehnt_grund TEXT;

-- Index fuer Token-Lookup
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_ablehnen_token ON gutachter_termine(ablehnen_token) WHERE ablehnen_token IS NOT NULL;
