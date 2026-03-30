-- KFZ-3: Kunden-Portal Auth + Onboarding
-- Adds kunde_id, onboarding_complete to faelle, creates pflichtdokumente table, and RLS policies

-- 1. Add kunde_id, onboarding_complete, and kundenbetreuer_id to faelle
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kunde_id uuid REFERENCES auth.users(id);
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS kundenbetreuer_id uuid REFERENCES profiles(id);

-- Index for fast lookup by kunde_id
CREATE INDEX IF NOT EXISTS idx_faelle_kunde_id ON faelle(kunde_id);

-- 2. pflichtdokumente table: tracks required documents per case
CREATE TABLE IF NOT EXISTS pflichtdokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fall_id uuid NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
  titel text NOT NULL,
  beschreibung text,
  pflicht boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ausstehend' CHECK (status IN ('ausstehend', 'hochgeladen')),
  datei_url text,
  datei_name text,
  datei_groesse integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_fall_id ON pflichtdokumente(fall_id);

-- 3. RLS Policies

-- Enable RLS on faelle (if not already)
ALTER TABLE faelle ENABLE ROW LEVEL SECURITY;

-- Kunde can only SELECT their own case
CREATE POLICY kunde_select_own_fall ON faelle
  FOR SELECT
  TO authenticated
  USING (kunde_id = auth.uid());

-- Enable RLS on pflichtdokumente
ALTER TABLE pflichtdokumente ENABLE ROW LEVEL SECURITY;

-- Kunde can SELECT their own pflichtdokumente (via fall ownership)
CREATE POLICY kunde_select_own_pflichtdokumente ON pflichtdokumente
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM faelle WHERE faelle.id = pflichtdokumente.fall_id AND faelle.kunde_id = auth.uid()
    )
  );

-- Kunde can UPDATE their own pflichtdokumente (to upload documents)
CREATE POLICY kunde_update_own_pflichtdokumente ON pflichtdokumente
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM faelle WHERE faelle.id = pflichtdokumente.fall_id AND faelle.kunde_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM faelle WHERE faelle.id = pflichtdokumente.fall_id AND faelle.kunde_id = auth.uid()
    )
  );
