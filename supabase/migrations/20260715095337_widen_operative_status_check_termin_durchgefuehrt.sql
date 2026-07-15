-- B4-slice-2a-i-b: termin_durchgefuehrt wird gueltiger operative_status-Wert (33. Wert).
-- nur_gutachter-Terminal-Konvergenz: closeNurGutachterTerminAlsDurchgefuehrt schreibt kuenftig
-- operative_status='termin_durchgefuehrt' (statt gar nicht) -> die Achse traegt den Terminal.
-- Additiv (NULL-permissiv bleibt); alle bestehenden Writes ⊆ der bisherigen 32 Werte.
ALTER TABLE public.claims DROP CONSTRAINT claims_operative_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_operative_status_check
  CHECK (operative_status IS NULL OR operative_status = ANY (ARRAY[
    'ersterfassung','onboarding','sv-gesucht','sv-zugewiesen','sv-termin','besichtigung',
    'begutachtung-laeuft','gutachten-eingegangen','filmcheck','qc-pruefung','kanzlei-uebergeben',
    'anschlussschreiben','regulierung','regulierung-laeuft','nachbesichtigung-laeuft',
    'zahlung-eingegangen','vs-abgelehnt','abgeschlossen','storniert','reparatur-werkstatt-suche',
    'reparatur-angefragt','reparatur-laeuft','reparatur-erledigt','vs-kuerzt','klage',
    'in_kommunikation_vs','abgelehnt','an_externe_kanzlei_uebergeben','reguliert_vollstaendig',
    'klage_rechtsstreit','verjaehrt','abgelehnt_final','termin_durchgefuehrt'
  ]::text[]));
