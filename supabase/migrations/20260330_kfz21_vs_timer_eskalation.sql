-- KFZ-21: VS-Timer Eskalationssystem
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vs_eskalationsstufe TEXT DEFAULT 'vs-01' CHECK (vs_eskalationsstufe IN ('vs-01','vs-02','vs-03','vs-04','vs-05','vs-06','vs-07'));
