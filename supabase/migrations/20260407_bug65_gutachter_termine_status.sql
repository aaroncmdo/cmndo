-- BUG-65: CHECK Constraint auf gutachter_termine.status erweitern
-- Der Constraint erlaubte wahrscheinlich 'reserviert' nicht

ALTER TABLE gutachter_termine DROP CONSTRAINT IF EXISTS gutachter_termine_status_check;
ALTER TABLE gutachter_termine ADD CONSTRAINT gutachter_termine_status_check
  CHECK (status IN ('reserviert', 'bestaetigt', 'abgelehnt', 'abgesagt', 'storniert', 'abgeschlossen', 'sv_gesucht', 'gegenvorschlag', 'verschoben'));
