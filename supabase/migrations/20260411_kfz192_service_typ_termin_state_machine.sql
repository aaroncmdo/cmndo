-- KFZ-192: Service-Typ + Termin-State-Machine + SV-Ablehnquote + Gegenvorschlag
-- Applied via Supabase MCP on 2026-04-11

ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_typ TEXT NOT NULL DEFAULT 'komplett' CHECK (service_typ IN ('komplett', 'nur_gutachter'));
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS service_typ TEXT NOT NULL DEFAULT 'komplett' CHECK (service_typ IN ('komplett', 'nur_gutachter'));
ALTER TABLE flow_links ADD COLUMN IF NOT EXISTS service_typ TEXT DEFAULT 'komplett';

ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS final_verbindlich_ab TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_ablehnung_grund TEXT;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_ablehnung_am TIMESTAMPTZ;
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS sv_vorgeschlagene_slots JSONB;

ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS ablehnungen_30_tage INT NOT NULL DEFAULT 0;
