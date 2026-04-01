-- ============================================================================
-- BUG-40: SAMMEL-MIGRATION — Alle fehlenden Spalten + Tabellen
-- Deckt ab: sachverstaendige, faelle, leads, flow_links, lead_historie
-- Alle Statements mit IF NOT EXISTS — sicher bei Wiederholung
-- ============================================================================

-- ─── 1. lead_historie Tabelle (KFZ-106) ─────────────────────────────────────

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

ALTER TABLE lead_historie ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_historie' AND policyname = 'Authenticated users can read lead_historie') THEN
    CREATE POLICY "Authenticated users can read lead_historie" ON lead_historie FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_historie' AND policyname = 'Authenticated users can insert lead_historie') THEN
    CREATE POLICY "Authenticated users can insert lead_historie" ON lead_historie FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- lead_historie Trigger
CREATE OR REPLACE FUNCTION log_lead_changes() RETURNS TRIGGER AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  skip_cols text[] := ARRAY['id', 'created_at', 'updated_at'];
  changed_by uuid;
BEGIN
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

DROP TRIGGER IF EXISTS lead_changes_trigger ON leads;
CREATE TRIGGER lead_changes_trigger
  AFTER UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION log_lead_changes();

-- ─── 2. flow_links Tabelle (KFZ-108) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flow_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  geoeffnet_am timestamptz,
  abgeschlossen_am timestamptz,
  status text NOT NULL DEFAULT 'erstellt',
  fall_id uuid REFERENCES faelle(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_flow_links_token ON flow_links(token);
CREATE INDEX IF NOT EXISTS idx_flow_links_lead_id ON flow_links(lead_id);

ALTER TABLE flow_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flow_links' AND policyname = 'Anon can read flow_links by token') THEN
    CREATE POLICY "Anon can read flow_links by token" ON flow_links FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flow_links' AND policyname = 'Authenticated can manage flow_links') THEN
    CREATE POLICY "Authenticated can manage flow_links" ON flow_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flow_links' AND policyname = 'Anon can update flow_links') THEN
    CREATE POLICY "Anon can update flow_links" ON flow_links FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 3. leads — fehlende Spalten ─────────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallhergang text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS polizei_vor_ort boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unfallmitteilung_hochgeladen boolean DEFAULT false;

-- ─── 4. faelle — fehlende Spalten (sicherheitshalber) ───────────────────────

ALTER TABLE faelle ADD COLUMN IF NOT EXISTS sv_zugewiesen_am timestamptz;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS gutachter_termin_status text;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS konvertiert_am timestamptz;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS konvertiert_von_lead uuid;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS leadbearbeiter_id uuid;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS regulierung_angekuendigt_am timestamptz;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS abgeschlossen_am timestamptz;

-- ─── 5. unterschriften Storage Bucket ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('unterschriften', 'unterschriften', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anon can upload unterschriften') THEN
    CREATE POLICY "Anon can upload unterschriften" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'unterschriften');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated can read unterschriften') THEN
    CREATE POLICY "Authenticated can read unterschriften" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'unterschriften');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anon can read own unterschriften') THEN
    CREATE POLICY "Anon can read own unterschriften" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'unterschriften');
  END IF;
END $$;

-- ─── 6. finance_eintraege Tabelle (fehlte komplett) ─────────────────────────

CREATE TABLE IF NOT EXISTS finance_eintraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL,
  betrag numeric,
  status text DEFAULT 'offen',
  beschreibung text,
  referenz_id uuid,
  referenz_typ text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE finance_eintraege ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_eintraege' AND policyname = 'Authenticated can manage finance_eintraege') THEN
    CREATE POLICY "Authenticated can manage finance_eintraege" ON finance_eintraege FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
