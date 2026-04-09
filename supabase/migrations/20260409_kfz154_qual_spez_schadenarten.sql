-- KFZ-154: Qualifikationen / Spezifikationen / Schadenarten als 3 separate
-- Felder. Die alte qualifikationen-Spalte bleibt als Fallback bestehen, neue
-- Forms schreiben in BEIDE (legacy + _neu) damit die existierenden Read-Side
-- Anzeigen (admin/karte, onboarding) nicht brechen.

ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS qualifikationen_neu TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS spezifikationen TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS schadenarten TEXT[] NOT NULL DEFAULT '{}';

-- faelle bekommt 2 zusaetzliche Felder fuer den Dispatcher-Match.
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS spezifikation TEXT NULL;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS schadenart TEXT NULL;

-- GIN-Indizes fuer den array-contains Filter im Dispatcher
CREATE INDEX IF NOT EXISTS idx_sv_spezifikationen_gin ON sachverstaendige USING GIN (spezifikationen);
CREATE INDEX IF NOT EXISTS idx_sv_schadenarten_gin ON sachverstaendige USING GIN (schadenarten);
CREATE INDEX IF NOT EXISTS idx_sv_qualifikationen_neu_gin ON sachverstaendige USING GIN (qualifikationen_neu);

-- Best-effort Backfill: bestehende qualifikationen-Eintraege die offensichtlich
-- in eine der drei neuen Listen fallen werden mit-uebernommen.
UPDATE sachverstaendige
SET qualifikationen_neu = ARRAY(
  SELECT DISTINCT q FROM unnest(COALESCE(qualifikationen, ARRAY[]::TEXT[])) AS q
  WHERE q IN (
    'Haftpflichtschaden','Kaskoschaden','Bewertungen','Wertgutachten',
    'Reparaturkostengutachten','Beweissicherung','Schiedsgutachten',
    'Gerichtsgutachten','Oldtimer-Bewertung','Leasingrücknahme',
    'Restwertermittlung','Wiederbeschaffungswert'
  )
)
WHERE qualifikationen IS NOT NULL
  AND array_length(qualifikationen, 1) IS NOT NULL
  AND (qualifikationen_neu IS NULL OR array_length(qualifikationen_neu, 1) IS NULL);

UPDATE sachverstaendige
SET spezifikationen = ARRAY(
  SELECT DISTINCT q FROM unnest(COALESCE(qualifikationen, ARRAY[]::TEXT[])) AS q
  WHERE q IN (
    'PKW','LKW','Transporter','Motorrad','Wohnmobil','Wohnwagen','Anhänger',
    'Oldtimer','Youngtimer','E-Fahrzeuge','Hybrid','Sportwagen',
    'Nutzfahrzeuge','Landmaschinen','Baumaschinen','Sonderfahrzeuge',
    'LKW/Nutzfahrzeuge','Elektrofahrzeuge'
  )
)
WHERE qualifikationen IS NOT NULL
  AND array_length(qualifikationen, 1) IS NOT NULL
  AND (spezifikationen IS NULL OR array_length(spezifikationen, 1) IS NULL);

UPDATE sachverstaendige
SET schadenarten = ARRAY(
  SELECT DISTINCT q FROM unnest(COALESCE(qualifikationen, ARRAY[]::TEXT[])) AS q
  WHERE q IN (
    'Karosserieschaden','Lackschaden','Hagelschaden','Brandschaden',
    'Wasserschaden','Elementarschaden','Diebstahlschaden','Vandalismusschaden',
    'Glasschaden','Marderschaden','Wildschaden','Motorschaden',
    'Getriebeschaden','Totalschaden','Bagatellschaden','Totalschaden-Bewertung',
    'Unfallrekonstruktion'
  )
)
WHERE qualifikationen IS NOT NULL
  AND array_length(qualifikationen, 1) IS NOT NULL
  AND (schadenarten IS NULL OR array_length(schadenarten, 1) IS NULL);
