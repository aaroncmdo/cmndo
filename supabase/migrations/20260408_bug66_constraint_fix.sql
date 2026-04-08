-- BUG-66: gutachter_termine_status_check Constraint auf Prod fixen
-- Die BUG-65 Migration wurde nicht angewendet, Prod hat noch den alten Constraint:
-- ('bestaetigt','abgelehnt','vorschlag','storniert')
-- Code inserted 'reserviert' beim Lead-Zuweisen → Constraint-Verletzung

ALTER TABLE gutachter_termine DROP CONSTRAINT IF EXISTS gutachter_termine_status_check;
ALTER TABLE gutachter_termine ADD CONSTRAINT gutachter_termine_status_check
  CHECK (status IN ('reserviert', 'bestaetigt', 'abgelehnt', 'abgesagt', 'storniert', 'abgeschlossen', 'sv_gesucht', 'gegenvorschlag', 'verschoben'));
