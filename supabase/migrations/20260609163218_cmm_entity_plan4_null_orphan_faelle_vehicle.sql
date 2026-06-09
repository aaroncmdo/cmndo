-- CMM-Entity Plan 4 Prep -- Orphan-faelle-Vehicle-Daten nullen.
-- Bestands-Claims OHNE vehicle-Entitaet, aber mit flachen faelle-Fahrzeugdaten, sind
-- pre-Plan-3-Orphans (Plan 3 erzeugt ab jetzt immer eine vehicle-Entitaet). Aktuell genau 1:
-- CLM-2026-00244 mit INVALIDER 12-stelliger Test-FIN (vehicles erzwingt 17 Zeichen -> nicht
-- backfillbar). Die flachen Werte nullen, damit v_claim_full (veh-gesourct, NULL) == faelle ist
-- (Gate LOSS=0 fuer CMM-49-Repoint), ohne die vehicles-Entitaet mit Junk zu verschmutzen.
-- Set-based + idempotent: trifft nur vehicle-lose Claims mit flachen Restdaten. Spalten-Drop = Plan 5.
UPDATE public.faelle f
SET kennzeichen = NULL, kennzeichen_buchstaben = NULL, fin_vin = NULL,
    fahrzeug_hersteller = NULL, fahrzeug_modell = NULL, fahrzeug_typ = NULL,
    hsn = NULL, tsn = NULL, fahrzeug_baujahr = NULL, kilometerstand = NULL,
    erstzulassung = NULL, lackfarbe_code = NULL, fahrzeug_farbe = NULL,
    fahrzeug_ausstattung = NULL, fin_quelle = NULL, fin_extrahiert_am = NULL
FROM public.faelle_claim_bridge b
JOIN public.claims c ON c.id = b.claim_id
WHERE b.fall_id = f.id
  AND c.vehicle_id IS NULL
  AND (f.kennzeichen IS NOT NULL OR f.fin_vin IS NOT NULL OR f.fahrzeug_hersteller IS NOT NULL
       OR f.fahrzeug_modell IS NOT NULL OR f.hsn IS NOT NULL OR f.tsn IS NOT NULL
       OR f.fahrzeug_baujahr IS NOT NULL OR f.kennzeichen_buchstaben IS NOT NULL);
