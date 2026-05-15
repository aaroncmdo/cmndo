-- AAR-114: Lead-Qualifizierung nach Notion-Spec (validiert 14.04.2026 mit Nicolas Kitta)

-- Gespraechs-Timer (8-Minuten Leitfaden)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gespraech_gestartet_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gespraech_beendet_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gespraech_dauer_sekunden INTEGER;

-- Disqualifikations-Grund als Key (nicht Freitext) fuer ExitSkript-Mapping
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS disqualifikations_grund_key TEXT;

COMMENT ON COLUMN leads.disqualifikations_grund_key IS 'AAR-114 Enum: eigenverantwortung | kein_schaden | kein_haftpflicht | fahrerflucht_ohne_kz | parkplatz_ohne_kamera';
COMMENT ON COLUMN leads.gespraech_gestartet_am IS 'AAR-114: Zeitpunkt an dem der MA den Gespraechs-Timer gestartet hat';
COMMENT ON COLUMN leads.gespraech_beendet_am IS 'AAR-114: Zeitpunkt an dem der MA das Gespraech beendet hat';
COMMENT ON COLUMN leads.gespraech_dauer_sekunden IS 'AAR-114: Effektive Gespraechsdauer in Sekunden (Ziel: max 480)';
;
