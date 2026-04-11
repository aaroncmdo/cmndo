-- KFZ-200: SV-Navigation + Vor-Ort-Modus + OCR
-- Applied via Supabase MCP on 2026-04-11

ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS navigation_started_at TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_unterwegs_seit TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_eta_minuten INT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_eta_letzte_berechnung TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_angekommen_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS reminder_15min_sent_at TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS reminder_5min_sent_at TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS durchgefuehrt_am TIMESTAMPTZ;

ALTER TABLE sv_live_position ADD COLUMN IF NOT EXISTS route_polyline TEXT;
ALTER TABLE sv_live_position ADD COLUMN IF NOT EXISTS distance_to_target_meters INT;

ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS discrepancy_flag BOOLEAN DEFAULT false;
ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS ocr_result JSONB;
ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS uploaded_by_sv BOOLEAN DEFAULT false;
ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS uploaded_by_kunde BOOLEAN DEFAULT false;
ALTER TABLE fall_dokumente ADD COLUMN IF NOT EXISTS schaden_position TEXT;
