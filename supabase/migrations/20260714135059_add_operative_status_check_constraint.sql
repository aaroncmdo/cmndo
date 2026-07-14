-- B1a der Status-Achsen-Konsolidierung (Spec 2026-07-14): operative_status bekommt
-- ZUM ERSTEN MAL einen CHECK. Vokabular = aktuelle fall_status-Enum-Menge (25 Werte),
-- exakt die von den 4 Writern (state-machine/convert/endzustand/werkstatt) geschriebenen
-- Werte. NULL-permissiv (Konvention wie claims_status_check). Rein additiv: alle heutigen
-- Writes sind Teilmenge dieser 25 (verifiziert), kein Reader/Writer/Filter bricht. Entsperrt
-- den DB-seitigen Silent-Reject-Schutz auf der SSoT-Achse. (Der flag-drift-Ratchet-Snapshot
-- + die 7 Terminal-Outcomes folgen in B1b, sobald die toten Filterwerte reguliert/abgelehnt
-- in convert-lead-to-claim:961 koordiniert bereinigt sind — cross-lane aar-956/vermittler-ssot.)
ALTER TABLE public.claims
  ADD CONSTRAINT claims_operative_status_check
  CHECK (operative_status IS NULL OR operative_status = ANY (ARRAY[
    'ersterfassung','onboarding','sv-gesucht','sv-zugewiesen','sv-termin',
    'besichtigung','begutachtung-laeuft','gutachten-eingegangen','filmcheck',
    'qc-pruefung','kanzlei-uebergeben','anschlussschreiben','regulierung',
    'regulierung-laeuft','nachbesichtigung-laeuft','zahlung-eingegangen',
    'vs-abgelehnt','abgeschlossen','storniert',
    'reparatur-werkstatt-suche','reparatur-angefragt','reparatur-laeuft','reparatur-erledigt',
    'vs-kuerzt','klage'
  ]::text[]));
