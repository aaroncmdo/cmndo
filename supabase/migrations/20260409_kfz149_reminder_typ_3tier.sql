-- KFZ-149 Hund-D Follow-up: Reminder-Kadenz auf 3 Stufen (T-7/T-3/T-1) per
-- abrechnung_reminders Tabelle. Bestehende Enum-Werte (reminder_5d/10d/13d/
-- einzug_versucht/einzug_fehlgeschlagen/gesperrt) bleiben erhalten — wir
-- ergaenzen drei neue Werte fuer den abrechnung-reminder Cron.

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'abrechnung_reminders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%reminder_typ%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE abrechnung_reminders DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE abrechnung_reminders ADD CONSTRAINT abrechnung_reminders_typ_check CHECK (
    reminder_typ IN (
      'reminder_7d','reminder_3d','reminder_1d',
      'reminder_5d','reminder_10d','reminder_13d',
      'einzug_versucht','einzug_fehlgeschlagen','gesperrt'
    )
  );
END $$;
