-- KFZ-35: Lead-Qualifizierung - Neue Spalten fuer erweiterte Schadentypen + Konstellationen

-- Qualifizierungs-Phase (Kanban innerhalb des Leads)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualifizierungs_phase TEXT DEFAULT 'neu'
  CHECK (qualifizierungs_phase IN ('neu','erstkontakt','schadentyp-erfasst','konstellation-erfasst','gegner-daten','gutachtertermin','sa-unterschrieben','flow-gesendet','abgeschlossen'));

-- SF-03 Variante (A = Gegner bekannt, B = Fahrerflucht)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sf_variante TEXT;

-- Gegnerdaten (SF-01, SF-02, SF-03A)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gegner_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gegner_versicherung TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gegner_kennzeichen TEXT;

-- Eigene Versicherung (SF-02, SF-03B, SF-04)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eigene_versicherung TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eigene_policennr TEXT;

-- Polizei
ALTER TABLE leads ADD COLUMN IF NOT EXISTS polizei_aktenzeichen TEXT;

-- SF-04 Schadensursache (wild, hagel, vandalismus, marderbiss, sturm)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS schadensursache TEXT;

-- KK-02 Leasing
ALTER TABLE leads ADD COLUMN IF NOT EXISTS leasing_geber TEXT;

-- KK-03 Finanzierung
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finanzierung_bank TEXT;

-- KK-04 Firma
ALTER TABLE leads ADD COLUMN IF NOT EXISTS firma_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS firma_ustid TEXT;

-- KK-05 Halter != Fahrer
ALTER TABLE leads ADD COLUMN IF NOT EXISTS halter_name TEXT;

-- Update test-leads phone numbers
UPDATE leads SET telefon = '+491633628571' WHERE telefon LIKE '017%' OR telefon LIKE '016%';
