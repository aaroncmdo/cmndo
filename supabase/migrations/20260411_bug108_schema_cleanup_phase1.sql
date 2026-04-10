-- BUG-108 Phase 1: Sichere Drops — 6 tote Spalten auf sachverstaendige
-- anzahlung_erhalten: 0 Code-Refs, 1 Row Testdaten
-- guthaben_aktuell: 0 Code-Refs, 0 Daten
-- prio_aktiv: 0 Code-Refs
-- freigeschaltet: ersetzt durch portal_zugang_freigeschaltet (KFZ-148)
-- guthaben_initial: 1 Type-Ref (gefixt)
-- anzahlung_bezahlt: 1 Type-Ref (gefixt zu anzahlung_bezahlt_am)

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS anzahlung_erhalten;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS guthaben_aktuell;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS prio_aktiv;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS freigeschaltet;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS guthaben_initial;
ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS anzahlung_bezahlt;
