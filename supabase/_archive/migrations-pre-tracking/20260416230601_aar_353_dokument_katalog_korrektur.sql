-- AAR-353: Dokument-Katalog Seeds korrigieren (AAR-321 Update).
-- Siehe Linear AAR-353 für vollständige Begründung.

-- 1. Entfallene Slots löschen
DELETE FROM dokument_katalog
WHERE slot_id IN ('fuehrerschein', 'leasingvertrag', 'finanzierungsvertrag', 'anspruchsschreiben', 'reparaturrechnungen_vorschaeden');

-- 2. Pflicht-Logik korrigieren
-- Schadensfotos sind nie Pflicht (nur optional)
UPDATE dokument_katalog SET pflicht_wenn = NULL WHERE slot_id = 'schadensfotos';

-- Polizeibericht nur Pflicht wenn Polizei vor Ort war
UPDATE dokument_katalog
SET pflicht_wenn = '{"op":"eq","field":"lead.polizei_vor_ort","value":true}'::jsonb,
    freigeschaltet_wenn = '{"op":"eq","field":"lead.polizei_vor_ort","value":true}'::jsonb
WHERE slot_id = 'polizeibericht';

-- 3. Neue Slots: reparaturrechnung_vorschaden, kaufvertrag, freigabe_bank
INSERT INTO dokument_katalog (
  slot_id, label, kategorie, freigeschaltet_wenn, pflicht_wenn,
  sichtbar_fuer, anforderbar_von, uploadbar_von, multi_file, sort_order, aktiv
) VALUES
  (
    'reparaturrechnung_vorschaden',
    'Reparaturrechnung (Vorschaden)',
    'fahrzeug',
    '{"op":"eq","field":"fall.vorschaden_erkannt","value":true}'::jsonb,
    '{"op":"eq","field":"fall.vorschaden_erkannt","value":true}'::jsonb,
    ARRAY['kunde','kundenbetreuer','sachverstaendiger','admin']::text[],
    ARRAY['kundenbetreuer','admin']::text[],
    ARRAY['kunde']::text[],
    false, 45, true
  ),
  (
    'kaufvertrag',
    'Kaufvertrag',
    'fahrzeug',
    '{"op":"eq","field":"fall.vorschaden_erkannt","value":true}'::jsonb,
    '{"op":"eq","field":"fall.vorschaden_erkannt","value":true}'::jsonb,
    ARRAY['kunde','kundenbetreuer','sachverstaendiger','admin']::text[],
    ARRAY['kundenbetreuer','admin']::text[],
    ARRAY['kunde']::text[],
    false, 46, true
  ),
  (
    'freigabe_bank',
    'Freigabe Bank (Reparatur/fiktive Abrechnung)',
    'kosten',
    '{"op":"in","field":"lead.finanzierung_leasing","value":["leasing","finanzierung"]}'::jsonb,
    '{"op":"in","field":"lead.finanzierung_leasing","value":["leasing","finanzierung"]}'::jsonb,
    ARRAY['kunde','kundenbetreuer','admin']::text[],
    ARRAY['kundenbetreuer','admin']::text[],
    ARRAY['kunde']::text[],
    false, 50, true
  )
ON CONFLICT (slot_id) DO UPDATE SET
  label = EXCLUDED.label,
  kategorie = EXCLUDED.kategorie,
  freigeschaltet_wenn = EXCLUDED.freigeschaltet_wenn,
  pflicht_wenn = EXCLUDED.pflicht_wenn,
  sichtbar_fuer = EXCLUDED.sichtbar_fuer,
  anforderbar_von = EXCLUDED.anforderbar_von,
  uploadbar_von = EXCLUDED.uploadbar_von,
  sort_order = EXCLUDED.sort_order;

-- 4. Sichtbarkeit korrigieren
UPDATE dokument_katalog
SET sichtbar_fuer = ARRAY['kundenbetreuer','admin','kanzlei']::text[]
WHERE slot_id = 'kanzlei_paket';

UPDATE dokument_katalog
SET sichtbar_fuer = ARRAY['kundenbetreuer','sachverstaendiger','admin','kanzlei']::text[]
WHERE slot_id = 'vorschaden_bericht';

-- 5. Alte pflichtdokumente-Rows für entfallene Slots bereinigen
DELETE FROM pflichtdokumente
WHERE dokument_typ IN ('fuehrerschein', 'leasingvertrag', 'finanzierungsvertrag', 'anspruchsschreiben', 'reparaturrechnungen_vorschaeden');;
