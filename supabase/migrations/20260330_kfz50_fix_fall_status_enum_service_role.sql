-- KFZ-50: fall_status Enum erweitern + RLS sicherstellen
-- Neue Enum-Werte hinzufuegen (bereits via SQL Editor ausgefuehrt)
-- ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'besichtigung' AFTER 'sv-termin';
-- ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'qc-pruefung' AFTER 'filmcheck';
-- ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'onboarding' AFTER 'ersterfassung';

-- Server Actions nutzen jetzt createServiceClient() mit SUPABASE_SERVICE_ROLE_KEY
-- Das umgeht RLS komplett fuer Admin-Writes
