-- AAR-550: Namens-Konsolidierung gutachter_id → sv_id auf 7 FK-Tabellen.
-- Non-destructive: RENAME COLUMN + RENAME CONSTRAINT + RENAME INDEX.
-- RLS-Policies und Index-Spalten-Referenzen werden von PG automatisch
-- auf den neuen Namen aktualisiert (intern per OID).

BEGIN;

-- 1. gutschriften
ALTER TABLE gutschriften RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE gutschriften RENAME CONSTRAINT gutschriften_gutachter_id_fkey TO gutschriften_sv_id_fkey;
ALTER INDEX idx_gutschriften_gutachter_offen RENAME TO idx_gutschriften_sv_offen;

-- 2. pflichtdokumente
ALTER TABLE pflichtdokumente RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE pflichtdokumente RENAME CONSTRAINT pflichtdokumente_gutachter_id_fkey TO pflichtdokumente_sv_id_fkey;
ALTER INDEX idx_pflichtdokumente_gutachter RENAME TO idx_pflichtdokumente_sv;

-- 3. reklamationen
ALTER TABLE reklamationen RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE reklamationen RENAME CONSTRAINT reklamationen_gutachter_id_fkey TO reklamationen_sv_id_fkey;

-- 4. stripe_events
ALTER TABLE stripe_events RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE stripe_events RENAME CONSTRAINT stripe_events_gutachter_id_fkey TO stripe_events_sv_id_fkey;

-- 5. sv_live_position
ALTER TABLE sv_live_position RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE sv_live_position RENAME CONSTRAINT sv_live_position_gutachter_id_fkey TO sv_live_position_sv_id_fkey;
ALTER INDEX idx_sv_live_position_gutachter RENAME TO idx_sv_live_position_sv;

-- 6. sv_payment_reminders
ALTER TABLE sv_payment_reminders RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE sv_payment_reminders RENAME CONSTRAINT sv_payment_reminders_gutachter_id_fkey TO sv_payment_reminders_sv_id_fkey;
-- idx_payment_reminders_unique bleibt wie es ist (Name ist tabellen-bezogen, nicht spalten-bezogen)

-- 7. vertraege_unterzeichnet
ALTER TABLE vertraege_unterzeichnet RENAME COLUMN gutachter_id TO sv_id;
ALTER TABLE vertraege_unterzeichnet RENAME CONSTRAINT vertraege_unterzeichnet_gutachter_id_fkey TO vertraege_unterzeichnet_sv_id_fkey;
ALTER INDEX idx_vertraege_gutachter RENAME TO idx_vertraege_sv;

COMMIT;;
