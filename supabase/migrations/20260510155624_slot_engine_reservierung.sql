-- PR 4: Slot-Engine — Reservierungs-Lock auf gutachter_finder_anfragen.
--
-- Zwei timestamptz-Spalten halten den reservierten Termin-Slot für eine laufende
-- Anfrage. Ein EXCLUSION CONSTRAINT (btree_gist) verhindert Doppel-Reservierung
-- auf demselben sv_id im gleichen Zeitfenster.
--
-- Außerdem: arbeitszeiten JSONB auf sachverstaendige für Arbeitszeit-Konfig.
-- Default: Mo-Fr 08-18 Uhr wenn NULL.
--
-- Plan: docs/plans/dynamic-onboarding-plan-2026-05-10.md PR 4

-- btree_gist für EXCLUSION CONSTRAINT (Zeitbereich-Überlappungsprüfung)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reservierungs-Spalten
ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS reservierter_slot_von  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservierter_slot_bis   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservierter_sv_id      UUID REFERENCES sachverstaendige(id);

COMMENT ON COLUMN gutachter_finder_anfragen.reservierter_slot_von IS
  'PR 4: Beginn des reservierten Slots — wird beim SlotField-Submit gesetzt, nach 30 Min TTL-Cron freigegeben.';
COMMENT ON COLUMN gutachter_finder_anfragen.reservierter_slot_bis IS
  'PR 4: Ende des reservierten Slots (typisch +60 Min). EXCLUSION CONSTRAINT verhindert Kollision.';
COMMENT ON COLUMN gutachter_finder_anfragen.reservierter_sv_id IS
  'PR 4: SV für den der Slot reserviert ist — Teil des EXCLUSION CONSTRAINT.';

-- EXCLUSION CONSTRAINT: kein zweiter reservierter Slot beim gleichen SV im gleichen Fenster.
-- Nur aktive Reservierungen (status NOT IN ('abgeschlossen','storniert','entwurf')) werden geprüft.
-- Analog zu AAR-865 (gutachter_termine EXCLUSION CONSTRAINT).
ALTER TABLE gutachter_finder_anfragen
  ADD CONSTRAINT gfa_slot_exclusion
  EXCLUDE USING gist (
    reservierter_sv_id WITH =,
    tstzrange(reservierter_slot_von, reservierter_slot_bis) WITH &&
  )
  WHERE (
    reservierter_sv_id IS NOT NULL
    AND reservierter_slot_von IS NOT NULL
    AND reservierter_slot_bis IS NOT NULL
    AND status NOT IN ('abgeschlossen', 'storniert', 'entwurf')
  );

-- Index für TTL-Cron (Suche nach abgelaufenen Entwürfen mit Slot-Reservierung)
CREATE INDEX IF NOT EXISTS idx_gfa_slot_ttl
  ON gutachter_finder_anfragen (reservierter_slot_von)
  WHERE reservierter_slot_von IS NOT NULL AND status = 'entwurf';

-- Arbeitszeiten-Konfig pro SV (JSONB, Default Mo-Fr 08-18)
ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS arbeitszeiten JSONB;

COMMENT ON COLUMN sachverstaendige.arbeitszeiten IS
  'PR 4: Arbeitszeit-Konfig für Slot-Berechnung.
   Format: {"mo":{"von":"08:00","bis":"18:00"},"di":{...},...}
   NULL = Default Mo-Fr 08:00-18:00. Wochentage: mo, di, mi, do, fr, sa, so.';
