-- AAR-360 Follow-up: Entkopplung Gutachter-Datenschutz + Widerrufsbelehrung von der SA-Signatur.
-- Die Datenschutzbestimmungen + Widerrufsbelehrung des zugewiesenen Gutachters werden NICHT mehr
-- mit der Kunden-Unterschrift gestempelt (das war rechtlich falsch — Info-/Belehrungs-Dokumente,
-- keine Unterschrift), sondern im FlowLink per Extra-Haekchen zugestimmt. Dieser Zeitstempel haelt
-- die Zustimmung fest. Der Gutachter = claims.sv_id zum Zeitpunkt der Zustimmung. SA +
-- Honorarvereinbarung bleiben signiert.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS sv_datenschutz_widerruf_zugestimmt_am timestamptz;

COMMENT ON COLUMN public.claims.sv_datenschutz_widerruf_zugestimmt_am IS
  'AAR-360 Follow-up: Zeitpunkt der Kunden-Zustimmung (FlowLink-Haekchen) zu Datenschutz + Widerrufsbelehrung des zugewiesenen Gutachters (claims.sv_id). Entkoppelt von der SA-Signatur.';
