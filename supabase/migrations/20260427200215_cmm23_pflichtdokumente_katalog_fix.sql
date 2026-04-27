-- CMM-23: Pflichtdokumente-Katalog auf Aaron-Spec bringen.
--
-- Aaron-Spec (2026-04-27): Pflicht-Slots werden durch Lead bestimmt.
--   immer Pflicht: schadensfotos, unfallfotos
--   zb1_status != 'bestaetigt' → fahrzeugschein (Pflicht)
--   polizei_vor_ort=true       → polizeibericht (Pflicht)
--   personenschaden_flag=true  → aerztliches_attest + diagnosebericht (Pflicht)
--   sachschaden_flag=true      → sachschaden_foto + sachschaden_rechnung (Pflicht)
--
-- Drift gegenüber Soll:
-- - schadensfotos.pflicht_wenn = NULL → wird nie als Pflicht angelegt
-- - diagnosebericht.pflicht_wenn = NULL → wird nie als Pflicht angelegt
-- - fahrzeugschein.freigeschaltet_wenn = `zb1_status='gesendet'` (zu eng,
--   matcht nicht 'ausstehend' / NULL)
-- - unfallfotos = fehlt komplett im Katalog

-- Helper-Rule: "immer Pflicht" via lead.id is_not_null (Lead hat immer eine ID)
-- Kein dedicated Truthy-Operator — workaround.

-- 1. unfallfotos einfügen — immer angezeigt, immer Pflicht
INSERT INTO dokument_katalog (
  slot_id, label, beschreibung, kategorie,
  freigeschaltet_wenn, pflicht_wenn,
  uploadbar_von, anforderbar_von, sichtbar_fuer,
  multi_file, max_mb, akzeptierte_mime_types,
  sort_order, aktiv
)
VALUES (
  'unfallfotos',
  'Fotos vom Unfall-Ort',
  'Übersicht der Unfallstelle, Endpositionen der Fahrzeuge.',
  'unfall',
  NULL,
  '{"field": "lead.id", "op": "is_not_null"}',
  ARRAY['kunde', 'kundenbetreuer', 'sachverstaendiger'],
  ARRAY['kundenbetreuer', 'sachverstaendiger'],
  ARRAY['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  true,
  10,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
  120,
  true
)
ON CONFLICT (slot_id) DO UPDATE SET
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  freigeschaltet_wenn = EXCLUDED.freigeschaltet_wenn,
  uploadbar_von = EXCLUDED.uploadbar_von,
  sichtbar_fuer = EXCLUDED.sichtbar_fuer;

-- 2. schadensfotos: pflicht_wenn auf "immer Pflicht"
UPDATE dokument_katalog
SET pflicht_wenn = '{"field": "lead.id", "op": "is_not_null"}'::jsonb
WHERE slot_id = 'schadensfotos';

-- 3. diagnosebericht: pflicht_wenn auf personenschaden_flag=true
UPDATE dokument_katalog
SET pflicht_wenn = '{"field": "lead.personenschaden_flag", "op": "eq", "value": true}'::jsonb
WHERE slot_id = 'diagnosebericht';

-- 4. fahrzeugschein: freigeschaltet + pflicht auf "zb1_status NICHT bestaetigt"
UPDATE dokument_katalog
SET freigeschaltet_wenn = '{"field": "lead.zb1_status", "op": "neq", "value": "bestaetigt"}'::jsonb,
    pflicht_wenn = '{"field": "lead.zb1_status", "op": "neq", "value": "bestaetigt"}'::jsonb
WHERE slot_id = 'fahrzeugschein';

COMMENT ON COLUMN dokument_katalog.pflicht_wenn IS
  'CMM-23: Single Source für Pflicht-Status. NULL = optional. JSON-Rule wie freigeschaltet_wenn.';
