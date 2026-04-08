-- KFZ-138: Admin-Termine Tabelle (Rueckruf, Kunde, Intern)
-- Gutachter-Termine bleiben in gutachter_termine

CREATE TABLE IF NOT EXISTS admin_termine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL CHECK (typ IN ('rueckruf','kunde','intern')),
  titel TEXT NOT NULL,
  beschreibung TEXT NULL,
  start_zeit TIMESTAMPTZ NOT NULL,
  end_zeit TIMESTAMPTZ NOT NULL,
  fall_id UUID NULL REFERENCES faelle(id) ON DELETE SET NULL,
  kunde_id UUID NULL,
  erstellt_von UUID NOT NULL,
  zugewiesen_an UUID NULL,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt','abgesagt')),
  erinnerung_min_vorher INTEGER NULL,
  notizen TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_termine_start ON admin_termine(start_zeit);
CREATE INDEX IF NOT EXISTS idx_admin_termine_typ ON admin_termine(typ);
CREATE INDEX IF NOT EXISTS idx_admin_termine_fall ON admin_termine(fall_id);
