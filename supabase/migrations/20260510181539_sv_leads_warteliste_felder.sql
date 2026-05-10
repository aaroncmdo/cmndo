-- Wartelisten-Felder für sv_leads (gutachter-partner Marketing-Page)
-- Neue SVs tragen sich selbst ein — Dispatch prüft + aktiviert manuell.

ALTER TABLE sv_leads
  ADD COLUMN IF NOT EXISTS nachname            TEXT,
  ADD COLUMN IF NOT EXISTS qualifikationen     TEXT[],
  ADD COLUMN IF NOT EXISTS dat_expert_nr       TEXT,
  ADD COLUMN IF NOT EXISTS bvsk_nr             TEXT,
  ADD COLUMN IF NOT EXISTS ihk_zertifikat      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS oebuv_nr            TEXT,
  ADD COLUMN IF NOT EXISTS jahre_erfahrung     INT,
  ADD COLUMN IF NOT EXISTS auftraege_monat     INT,
  ADD COLUMN IF NOT EXISTS fachschwerpunkte    TEXT,
  ADD COLUMN IF NOT EXISTS radius_km           INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS warteliste_status   TEXT NOT NULL DEFAULT 'ausstehend'
    CHECK (warteliste_status IN ('ausstehend', 'kontaktiert', 'aktiv', 'abgelehnt')),
  ADD COLUMN IF NOT EXISTS warteliste_am       TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN sv_leads.warteliste_status IS
  'ausstehend = neu eingetragen, kontaktiert = Dispatch hat angerufen, aktiv = onboarded, abgelehnt = nicht aufgenommen';
