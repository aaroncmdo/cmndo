-- BUG-55: sv_gesucht Status + CHECK Constraint entfernen (flexible Werte)
ALTER TABLE faelle DROP CONSTRAINT IF EXISTS faelle_gutachter_termin_status_check;
-- gutachter_termin_status erlaubt jetzt: reserviert, bestaetigt, abgelehnt, abgesagt, verschoben, abgeschlossen, sv_gesucht
