-- AAR-317: Unfallhergang-Skizze per Claude-API.
-- MVP: SVG statt animiertem GIF. Animation als Follow-up.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS unfallskizze_url text,
  ADD COLUMN IF NOT EXISTS unfallskizze_svg text,
  ADD COLUMN IF NOT EXISTS unfallskizze_bestaetigt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unfallskizze_ablehnung_grund text,
  ADD COLUMN IF NOT EXISTS unfallskizze_generiert_am timestamptz;

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS unfallskizze_url text,
  ADD COLUMN IF NOT EXISTS unfallskizze_svg text,
  ADD COLUMN IF NOT EXISTS unfallskizze_bestaetigt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unfallskizze_ablehnung_grund text,
  ADD COLUMN IF NOT EXISTS unfallskizze_generiert_am timestamptz;

COMMENT ON COLUMN leads.unfallskizze_svg IS 'AAR-317: Roh-SVG der von Claude generierten Unfallskizze (base64-frei, inline einbettbar).';
COMMENT ON COLUMN leads.unfallskizze_url IS 'AAR-317: Optionale Public-URL (wenn in Storage abgelegt) — wird erst bei Freigabe + Kanzlei-Paket gefüllt.';
COMMENT ON COLUMN leads.unfallskizze_bestaetigt IS 'AAR-317: Kunde hat die Skizze im FlowLink bestätigt (später — MVP: MA-Freigabe genügt).';
COMMENT ON COLUMN leads.unfallskizze_ablehnung_grund IS 'AAR-317: Kunde hat abgelehnt — Freitext-Korrekturbeschreibung.';;
