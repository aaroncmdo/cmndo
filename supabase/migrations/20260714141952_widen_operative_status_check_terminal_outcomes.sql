-- B1b-1 Folge: claims_operative_status_check 25 -> 32 (die 7 Terminal/Outcome-Werte aus der
-- Enum-Extend-Migration). DROP IF EXISTS = replay-safe gegenueber B1a (#4268, das den 25er-CHECK
-- anlegt) unabhaengig von der File-Replay-Reihenfolge. Additiv (32 superset 25); nichts schreibt
-- die 7 neuen Werte bis B1b-2 -> kein Reader/Filter bricht. NULL-permissiv (Konvention).
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_operative_status_check;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_operative_status_check
  CHECK (operative_status IS NULL OR operative_status = ANY (ARRAY[
    'ersterfassung','onboarding','sv-gesucht','sv-zugewiesen','sv-termin',
    'besichtigung','begutachtung-laeuft','gutachten-eingegangen','filmcheck',
    'qc-pruefung','kanzlei-uebergeben','anschlussschreiben','regulierung',
    'regulierung-laeuft','nachbesichtigung-laeuft','zahlung-eingegangen',
    'vs-abgelehnt','abgeschlossen','storniert',
    'reparatur-werkstatt-suche','reparatur-angefragt','reparatur-laeuft','reparatur-erledigt',
    'vs-kuerzt','klage',
    'in_kommunikation_vs','abgelehnt','an_externe_kanzlei_uebergeben','reguliert_vollstaendig',
    'klage_rechtsstreit','verjaehrt','abgelehnt_final'
  ]::text[]));
