-- KFZ-202: faelle.status Enum-Erweiterung + VS-Reaktion Spalten
-- Neue Status-Werte fuer State-Machine + Regulierungs-Tracking

-- 1. Neue Enum-Werte (Konvention: Bindestriche wie bestehende Werte)
-- Bestehend: ersterfassung,onboarding,sv-gesucht,sv-zugewiesen,sv-termin,besichtigung,
--            gutachten-eingegangen,filmcheck,qc-pruefung,kanzlei-uebergeben,
--            anschlussschreiben,regulierung,abgeschlossen,storniert
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'begutachtung-laeuft' AFTER 'besichtigung';
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'regulierung-laeuft' AFTER 'regulierung';
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'zahlung-eingegangen' AFTER 'regulierung-laeuft';
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'vs-abgelehnt' AFTER 'zahlung-eingegangen';

-- 2. VS-Reaktion Spalten
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_reaktion_typ TEXT
  CHECK (vs_reaktion_typ IN ('voll_reguliert','gekuerzt','abgelehnt','mehr_zeit','nachbesichtigung'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_reaktion_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_ablehnungsgrund TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ruege_gesendet_am TIMESTAMPTZ;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS ruege_betrag NUMERIC(10,2);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS no_show_count INT DEFAULT 0;
