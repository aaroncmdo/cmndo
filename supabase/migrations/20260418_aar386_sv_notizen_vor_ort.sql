-- AAR-386 Nachzug: Getrennte Spalte für SV-Vor-Ort-Notizen aus dem Fokus-Modus,
-- damit diese nicht mit den allgemeinen faelle.notizen (Kundenbetreuer-Notizen,
-- Dispatch-Hinweise etc.) vermischt werden.
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS sv_notizen_vor_ort text;

COMMENT ON COLUMN faelle.sv_notizen_vor_ort IS
  'AAR-386: SV-spezifische Vor-Ort-Notizen aus dem Fokus-Modus (Feldmodus-Fallakte). Getrennt von faelle.notizen.';
