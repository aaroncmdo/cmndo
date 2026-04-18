-- AAR-358: Personenschäden-Detail-Erfassung pro Person (Name, Geburtsdatum,
-- Verletzungsart) — mit lead_id im Dispatch-Flow und fall_id nach SA.
--
-- 1. Tabelle personenschaden_personen (lead_id + fall_id FKs, Check dass mind. 1 gesetzt)
-- 2. pflichtdokumente.person_id als optionaler FK (für per-Person-Dokumente)
-- 3. RLS: Dispatch/Admin/Kundenbetreuer alles, Kunde nur eigene via fall_id
-- 4. updated_at-Trigger

BEGIN;

CREATE TABLE IF NOT EXISTS personenschaden_personen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  fall_id UUID REFERENCES faelle(id) ON DELETE CASCADE,
  vorname TEXT,
  nachname TEXT,
  geburtsdatum DATE,
  verletzungsart TEXT,
  ist_fahrzeuginsasse BOOLEAN NOT NULL DEFAULT true,
  notizen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT person_hat_parent CHECK (lead_id IS NOT NULL OR fall_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_personenschaden_personen_lead_id ON personenschaden_personen(lead_id);
CREATE INDEX IF NOT EXISTS idx_personenschaden_personen_fall_id ON personenschaden_personen(fall_id);

COMMENT ON TABLE personenschaden_personen IS
  'AAR-358: Pro verletzte Person (Fahrzeuginsasse, Fußgänger, Gegner) — Personalien + Verletzungsart. Wird im Dispatch mit lead_id angelegt und beim Fall-Anlegen mit fall_id upgegradet.';

-- pflichtdokumente: optionaler FK auf Person
ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES personenschaden_personen(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_person_id
  ON pflichtdokumente(person_id) WHERE person_id IS NOT NULL;

COMMENT ON COLUMN pflichtdokumente.person_id IS
  'AAR-358: Bei personenbezogenen Pflichtdokumenten (Attest, AU, Krankenhausbericht) die betroffene Person — NULL bei fall-globalen Dokumenten.';

-- RLS
ALTER TABLE personenschaden_personen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personenschaden_personen_admin_all" ON personenschaden_personen;
CREATE POLICY "personenschaden_personen_admin_all" ON personenschaden_personen
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.rolle IN ('admin', 'dispatch', 'kundenbetreuer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.rolle IN ('admin', 'dispatch', 'kundenbetreuer')
    )
  );

DROP POLICY IF EXISTS "personenschaden_personen_kunde_eigene" ON personenschaden_personen;
CREATE POLICY "personenschaden_personen_kunde_eigene" ON personenschaden_personen
  FOR ALL
  USING (
    fall_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM faelle
      WHERE faelle.id = personenschaden_personen.fall_id
        AND faelle.kunde_id = auth.uid()
    )
  )
  WITH CHECK (
    fall_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM faelle
      WHERE faelle.id = personenschaden_personen.fall_id
        AND faelle.kunde_id = auth.uid()
    )
  );

-- Updated-at Trigger
CREATE OR REPLACE FUNCTION personenschaden_personen_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personenschaden_personen_updated_at ON personenschaden_personen;
CREATE TRIGGER trg_personenschaden_personen_updated_at
  BEFORE UPDATE ON personenschaden_personen
  FOR EACH ROW EXECUTE FUNCTION personenschaden_personen_set_updated_at();

COMMIT;
