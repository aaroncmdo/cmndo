-- AAR-353: Dokument-Katalog Seeds korrigieren (AAR-321 Update).
--
-- Kontext: Der ursprüngliche Katalog-Seed enthielt Slots die es in der
-- Produktwirklichkeit nicht braucht (Führerschein, explizite Leasing-/
-- Finanzierungsverträge, Anspruchsschreiben als Doc-Typ) und falsche
-- Pflicht-Logik (Schadensfotos als Pflicht, Polizeibericht immer Pflicht).
--
-- Diese Migration:
--   1. Fügt faelle.vorschaden_erkannt hinzu (CarDentity-Flag).
--   2. Entfernt Slots: fuehrerschein, leasingvertrag, finanzierungsvertrag,
--      anspruchsschreiben, reparaturrechnungen_vorschaeden (ersetzt durch
--      Singular-Variante mit fall-basierter Regel).
--   3. Korrigiert Pflicht-Logik: Schadensfotos optional, Polizeibericht nur
--      wenn polizei_vor_ort=true.
--   4. Fügt neue Slots hinzu: reparaturrechnung_vorschaden, kaufvertrag
--      (Vorschaden-Freischaltung via CarDentity) + freigabe_bank (Leasing/
--      Finanzierung).
--   5. Korrigiert Sichtbarkeit für kanzlei_paket (intern, kein Kunde/SV) und
--      vorschaden_bericht (kein Kunde).
--   6. Bereinigt pflichtdokumente-Rows für die entfallenen Slot-IDs.

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS vorschaden_erkannt boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN faelle.vorschaden_erkannt IS 'AAR-353: true = CarDentity-Abfrage hat Vorschaden festgestellt; triggert Pflichtdokumente reparaturrechnung_vorschaden + kaufvertrag.';

DELETE FROM dokument_katalog
WHERE slot_id IN ('fuehrerschein', 'leasingvertrag', 'finanzierungsvertrag', 'anspruchsschreiben', 'reparaturrechnungen_vorschaeden');

UPDATE dokument_katalog SET pflicht_wenn = NULL WHERE slot_id = 'schadensfotos';

UPDATE dokument_katalog
SET pflicht_wenn = '{"op":"eq","field":"lead.polizei_vor_ort","value":true}'::jsonb,
    freigeschaltet_wenn = '{"op":"eq","field":"lead.polizei_vor_ort","value":true}'::jsonb
WHERE slot_id = 'polizeibericht';

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

UPDATE dokument_katalog
SET sichtbar_fuer = ARRAY['kundenbetreuer','admin','kanzlei']::text[]
WHERE slot_id = 'kanzlei_paket';

UPDATE dokument_katalog
SET sichtbar_fuer = ARRAY['kundenbetreuer','sachverstaendiger','admin','kanzlei']::text[]
WHERE slot_id = 'vorschaden_bericht';

DELETE FROM pflichtdokumente
WHERE dokument_typ IN ('fuehrerschein', 'leasingvertrag', 'finanzierungsvertrag', 'anspruchsschreiben', 'reparaturrechnungen_vorschaeden');
