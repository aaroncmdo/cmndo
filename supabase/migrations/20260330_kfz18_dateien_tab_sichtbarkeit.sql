-- KFZ-18: Dateien-Tab sortiert + Sichtbarkeit
-- Erweitert die dokumente-Tabelle um Kategorie, Sichtbarkeit und Herkunft

-- 1. Neue Spalten in dokumente
ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS kategorie TEXT
  CHECK (kategorie IN (
    'kundendokument','schadensfoto','gutachten','kanzlei',
    'unterschrift','sonstiges','whatsapp-foto','gutachter-foto'
  ));

ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS hochgeladen_von UUID REFERENCES profiles(id);
ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS hochgeladen_von_rolle TEXT;
ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS quelle TEXT
  CHECK (quelle IN ('flowlink','portal','whatsapp','gutachter','admin','kanzlei'));
ALTER TABLE dokumente ADD COLUMN IF NOT EXISTS sichtbar_fuer TEXT[] DEFAULT ARRAY['admin'];

-- 2. Bestehende Dokumente kategorisieren (Backfill)
UPDATE dokumente SET kategorie = 'schadensfoto'
  WHERE kategorie IS NULL AND (typ LIKE 'foto%' OR typ = 'schadensfoto' OR typ = 'schadensfotos');

UPDATE dokumente SET kategorie = 'gutachten'
  WHERE kategorie IS NULL AND typ = 'gutachten';

UPDATE dokumente SET kategorie = 'unterschrift'
  WHERE kategorie IS NULL AND typ IN ('abtretung','vollmacht','sa-unterschrift');

UPDATE dokumente SET kategorie = 'kundendokument'
  WHERE kategorie IS NULL AND typ IN (
    'fahrzeugschein','fuehrerschein','gegner-daten','eigene-versicherung',
    'polizeibericht','eigene-versicherungspolice','leasingvertrag',
    'finanzierungsvertrag','gewerbenachweis','gf-vollmacht',
    'halter-ausweis','aerztliches-attest','mietwagenvertrag','kunde-nachreichung'
  );

UPDATE dokumente SET kategorie = 'kanzlei'
  WHERE kategorie IS NULL AND typ IN ('kanzlei-paket','anschlussschreiben','regulierungsbescheid');

UPDATE dokumente SET kategorie = 'gutachter-foto'
  WHERE kategorie IS NULL AND typ = 'gutachter-foto';

UPDATE dokumente SET kategorie = 'sonstiges'
  WHERE kategorie IS NULL;

-- 3. Bestehende Dokumente: Sichtbarkeit setzen
UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','sachverstaendiger','kunde']
  WHERE kategorie = 'kundendokument';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','sachverstaendiger','kunde']
  WHERE kategorie = 'schadensfoto';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','sachverstaendiger','kunde','kanzlei']
  WHERE kategorie = 'gutachten';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','sachverstaendiger']
  WHERE kategorie = 'gutachter-foto';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','kunde','kanzlei']
  WHERE kategorie = 'kanzlei';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','kanzlei']
  WHERE kategorie = 'unterschrift';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer']
  WHERE kategorie = 'sonstiges';

UPDATE dokumente SET sichtbar_fuer = ARRAY['admin','kundenbetreuer','sachverstaendiger','kunde']
  WHERE kategorie = 'whatsapp-foto';
