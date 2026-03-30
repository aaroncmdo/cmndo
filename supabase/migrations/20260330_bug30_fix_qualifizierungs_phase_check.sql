-- BUG-30: CHECK Constraint fuer qualifizierungs_phase korrigieren
-- Alte Constraint droppen (egal wie sie heisst)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_qualifizierungs_phase_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_qualifizierungs_phase_check1;

-- Neue Constraint mit allen korrekten Phasen (BUG-27 + BUG-28)
ALTER TABLE leads ADD CONSTRAINT leads_qualifizierungs_phase_check
  CHECK (qualifizierungs_phase IN (
    'neu',
    'nicht-erreicht',
    'rueckruf',
    'in-qualifizierung',
    'erstkontakt',
    'schadentyp-erfasst',
    'konstellation-erfasst',
    'gegner-daten',
    'gutachtertermin',
    'flow-versendet',
    'flow-gesendet',
    'sa-ausstehend',
    'sa-unterschrieben',
    'konvertiert',
    'abgeschlossen',
    'disqualifiziert',
    'kalt'
  ));

-- RLS: Sicherstellen dass Admin + Leadbearbeiter leads updaten koennen
DO $$
BEGIN
  -- Drop existing update policies to avoid conflicts
  DROP POLICY IF EXISTS "Admin kann leads updaten" ON leads;
  DROP POLICY IF EXISTS "Leadbearbeiter kann eigene leads updaten" ON leads;

  -- Admin: Full access
  CREATE POLICY "Admin kann leads updaten" ON leads FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'superadmin'))
    );

  -- Leadbearbeiter: Only own leads
  CREATE POLICY "Leadbearbeiter kann eigene leads updaten" ON leads FOR UPDATE
    USING (zugewiesen_an = auth.uid());
END $$;
