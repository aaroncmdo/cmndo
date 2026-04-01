-- KFZ-106: Lead-Historie — Alle Änderungen protokolliert

-- 1. Historie-Tabelle
CREATE TABLE IF NOT EXISTS lead_historie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  feld text NOT NULL,
  alter_wert text,
  neuer_wert text,
  geaendert_von uuid,
  geaendert_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_historie_lead_id ON lead_historie(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_historie_geaendert_am ON lead_historie(geaendert_am DESC);

-- 2. RLS
ALTER TABLE lead_historie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read lead_historie"
  ON lead_historie FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert lead_historie"
  ON lead_historie FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Trigger-Funktion: Loggt alle Feld-Änderungen automatisch
CREATE OR REPLACE FUNCTION log_lead_changes() RETURNS TRIGGER AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  skip_cols text[] := ARRAY['id', 'created_at', 'updated_at'];
  changed_by uuid;
BEGIN
  -- Versuche auth.uid() zu holen (kann NULL sein bei Service-Client)
  BEGIN
    changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    changed_by := NULL;
  END;

  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'leads' AND table_schema = 'public'
    AND column_name != ALL(skip_cols)
  LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO old_val, new_val
      USING OLD, NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO lead_historie (lead_id, feld, alter_wert, neuer_wert, geaendert_von)
      VALUES (NEW.id, col, old_val, new_val, changed_by);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger auf leads-Tabelle
DROP TRIGGER IF EXISTS lead_changes_trigger ON leads;
CREATE TRIGGER lead_changes_trigger
  AFTER UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION log_lead_changes();
