-- AAR-357: Sachschäden im Dispatch erfassen + konditionale Dokumente.
--
-- Neben Personenschäden können beim Unfall auch Sachschäden an Dritten
-- entstehen (Leitplanke, Zaun, Mauer, Brille, Handy, etc.). Diese werden
-- bisher nicht erfasst. Wenn `sachschaden_flag=true`, schalten wir via
-- Katalog zwei Pflichtdokumente frei: Rechnung + Foto.
--
-- 1. Flag + Freitext-Beschreibung auf leads + faelle
-- 2. Zwei neue dokument_katalog-Slots mit JSON-DSL-Rule auf lead.sachschaden_flag

BEGIN;

-- ── 1. Leads + Faelle: Flag + Beschreibung ───────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sachschaden_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sachschaden_beschreibung TEXT;

ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS sachschaden_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sachschaden_beschreibung TEXT;

COMMENT ON COLUMN leads.sachschaden_flag IS
  'AAR-357: Sachschäden an Dritten beim Unfall (Leitplanke, Zaun, Handy etc.) — unabhängig vom KFZ-Schaden.';
COMMENT ON COLUMN leads.sachschaden_beschreibung IS
  'AAR-357: Freitext des Dispatchers — was wurde beschädigt?';
COMMENT ON COLUMN faelle.sachschaden_flag IS
  'AAR-357: Aus leads.sachschaden_flag beim Fall-Anlegen übernommen.';
COMMENT ON COLUMN faelle.sachschaden_beschreibung IS
  'AAR-357: Aus leads.sachschaden_beschreibung beim Fall-Anlegen übernommen.';

-- ── 2. Katalog-Seeds: Rechnung + Foto, beide pflicht wenn Flag=true ──────
-- Reihenfolge: sort_order 51/52 (nach Fahrzeug 31-40, Kanzlei 41-50, Kosten ab 51).
INSERT INTO dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von,
  multi_file, akzeptierte_mime_types, max_mb, sort_order
) VALUES
  ('sachschaden_rechnung', 'Rechnung Sachschaden',
   'Rechnung oder Kostenvoranschlag für Sachschäden an Dritten (z.B. Leitplanke, Zaun, Handy).',
   'kosten',
   '{"op":"eq","field":"lead.sachschaden_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.sachschaden_flag","value":true}'::jsonb,
   ARRAY['kunde','kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer']::text[],
   true, ARRAY['image/jpeg','image/png','application/pdf']::text[], 10, 51),

  ('sachschaden_foto', 'Foto Sachschaden',
   'Foto des beschädigten Gegenstands (Leitplanke, Zaun, Handy, Brille etc.).',
   'unfall',
   '{"op":"eq","field":"lead.sachschaden_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.sachschaden_flag","value":true}'::jsonb,
   ARRAY['kunde','kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kundenbetreuer','sachverstaendiger','kanzlei','admin']::text[],
   ARRAY['kunde','kundenbetreuer','sachverstaendiger']::text[],
   true, ARRAY['image/jpeg','image/png']::text[], 10, 52)
ON CONFLICT (slot_id) DO UPDATE SET
  label = EXCLUDED.label,
  beschreibung = EXCLUDED.beschreibung,
  kategorie = EXCLUDED.kategorie,
  freigeschaltet_wenn = EXCLUDED.freigeschaltet_wenn,
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  sichtbar_fuer = EXCLUDED.sichtbar_fuer,
  anforderbar_von = EXCLUDED.anforderbar_von,
  uploadbar_von = EXCLUDED.uploadbar_von,
  multi_file = EXCLUDED.multi_file,
  akzeptierte_mime_types = EXCLUDED.akzeptierte_mime_types,
  max_mb = EXCLUDED.max_mb,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMIT;
