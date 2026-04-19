-- AAR-549 S3: onboarding_abgeschlossen (bool) gedroppt.
--
-- Vorher: zwei parallele Onboarding-Status-Felder auf sachverstaendige:
--   onboarding_abgeschlossen (bool, DEFAULT false) — nur geschrieben, nie gelesen
--   onboarding_status        (text, Enum-artig)    — kanonische Quelle
--
-- Prod-Daten (Stand 2026-04-19):
--   id                                     status                 abgeschlossen
--   bb000001... (seed)                     abgeschlossen          true
--   9336ba57...                            bezahlt                false
--   065db1c1...                            vom_admin_angelegt     false
--   ab46df17...                            anzahlung_offen        false
--
-- Bool ist 1:1 aus onboarding_status ableitbar (true <=> status='abgeschlossen').
-- Kein Konsumer liest den Wert — dispatch/sachverstaendige/page.tsx selektiert
-- ihn, mappt ihn aber nicht in die Props des SachverstaendigeList-Components.
--
-- Schreibpfade (7 in admin/sachverstaendige/anlegen/actions.ts, 4 in
-- seed-testdata) werden synchron entfernt.
--
-- Einziger Schreiber von "true" ist seed-testdata — kein Prod-Code setzt den
-- Wert auf true, d.h. außer den seed-Datensätzen gibt es keine True-Werte.

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS onboarding_abgeschlossen;

COMMENT ON COLUMN sachverstaendige.onboarding_status IS
  'Onboarding-Status-Enum (text). Werte: pending, vom_admin_angelegt, vertrag_unterzeichnet, anzahlung_offen, bezahlt, aktiv, blockiert. Kanonische Quelle seit AAR-549 S3 (ersetzt den redundanten onboarding_abgeschlossen bool).';
