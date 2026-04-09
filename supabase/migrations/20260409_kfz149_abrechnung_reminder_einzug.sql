-- KFZ-149 Hund-D: abrechnung-reminder + abrechnung-einzug Crons brauchen
-- Tracking-Spalten zur Idempotenz und einen 'fehlgeschlagen' Status fuer
-- den Filter im /admin/abrechnungen Listing.

ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS reminder_gesendet_am TIMESTAMPTZ NULL;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS einzug_versucht_am TIMESTAMPTZ NULL;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS einzug_fehler TEXT NULL;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL;

-- Status-Enum um 'fehlgeschlagen' erweitern (Constraint droppen + neu setzen,
-- defensiv mit DO-Block weil der bestehende Constraint-Name unbekannt ist).
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'abrechnungen'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE abrechnungen DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE abrechnungen ADD CONSTRAINT abrechnungen_status_check CHECK (
    status IN ('entwurf','versendet','bezahlt','ueberfaellig','storniert','fehlgeschlagen')
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_abrechnungen_einzug_pending ON abrechnungen(faellig_am)
  WHERE bezahlt_am IS NULL AND einzug_versucht_am IS NULL;
