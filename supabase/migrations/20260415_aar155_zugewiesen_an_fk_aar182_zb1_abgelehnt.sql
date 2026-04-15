-- AAR-155 Audit-Fix: leads.zugewiesen_an hatte keinen FK-Constraint auf
-- profiles. Nach DELETE eines Dispatchers zeigte das Feld auf eine
-- ghosted UUID und leadbearbeiter_id erbte das. Jetzt SET NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_zugewiesen_an_fk'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_zugewiesen_an_fk
      FOREIGN KEY (zugewiesen_an) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- AAR-182 Audit-Fix: 'abgelehnt' zur zb1_status-CHECK hinzufügen damit
-- der „Nein — manuell eintragen"-Toggle persistiert werden kann statt
-- nur im Client-State zu leben.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_zb1_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_zb1_status_check
  CHECK (zb1_status IS NULL OR zb1_status = ANY (ARRAY[
    'ausstehend'::text,
    'gesendet'::text,
    'geoeffnet'::text,
    'hochgeladen'::text,
    'fehlgeschlagen'::text,
    'abgelehnt'::text
  ]));
