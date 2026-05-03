-- Gutachten-OCR-Felder auf claims.
-- Trigger: nach QC-Freigabe (gibKanzleipaketFrei) extrahiert ein
-- Claude-OCR-Pipeline die wesentlichen Werte aus dem Gutachten-PDF
-- und schreibt sie hierher als claim-SSoT.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS reparaturkosten_netto numeric(10, 2),
  ADD COLUMN IF NOT EXISTS reparaturkosten_brutto numeric(10, 2),
  ADD COLUMN IF NOT EXISTS minderwert numeric(10, 2),
  ADD COLUMN IF NOT EXISTS restwert numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungswert numeric(10, 2),
  ADD COLUMN IF NOT EXISTS wiederbeschaffungsdauer_tage integer,
  ADD COLUMN IF NOT EXISTS nutzungsausfall_tage integer,
  ADD COLUMN IF NOT EXISTS totalschaden boolean,
  ADD COLUMN IF NOT EXISTS gutachten_datum date,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_raw jsonb,
  ADD COLUMN IF NOT EXISTS gutachten_ocr_error text;

COMMENT ON COLUMN public.claims.gutachten_ocr_raw IS
  'Rohe Claude-Antwort (komplettes JSON) — fuer Audit + ggf. Re-Mapping '
  'von Feldern die das Schema nicht kennt.';

COMMENT ON COLUMN public.claims.gutachten_ocr_processed_at IS
  'Zeitpunkt der OCR-Verarbeitung. NULL = noch nicht verarbeitet.';
