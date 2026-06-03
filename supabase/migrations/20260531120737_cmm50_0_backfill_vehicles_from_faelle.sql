-- CMM-50.0 Task 1.6: Backfill vehicles aus bestehenden faelle mit valider FIN ohne vehicle-Link.
-- Spiegelt ensureVehicleFromFin (RPC upsert_vehicle_by_fin + 50.1-Snapshot + 3-Surface-Link).
-- Live: 1 Datensatz (claim 0f19efb3, FIN-only). Idempotent (IS-NULL/NOT-EXISTS-geguarded).
-- erstzulassung (text->date) bewusst NICHT geparst (TS-seitiger Helper-Parser; hier eh NULL),
-- COALESCE-View-Fallback auf faelle.erstzulassung greift bis zum faelle-Drop.
DO $$
DECLARE r record; v_vehicle_id uuid;
BEGIN
  FOR r IN
    SELECT f.id AS fall_id, f.claim_id, upper(f.fin_vin) AS fin, f.kennzeichen, f.hsn, f.tsn,
           f.fahrzeug_hersteller, f.fahrzeug_modell, f.kilometerstand,
           f.fahrzeug_typ, f.fahrzeug_farbe, f.lackfarbe_code, f.fahrzeug_baujahr,
           f.fahrzeug_ausstattung, f.kennzeichen_buchstaben, f.fin_quelle, f.fin_extrahiert_am
    FROM faelle f JOIN claims c ON c.id = f.claim_id
    WHERE f.fin_vin ~ '^[A-HJ-NPR-Z0-9]{17}$' AND c.vehicle_id IS NULL
  LOOP
    v_vehicle_id := public.upsert_vehicle_by_fin(
      p_fin := r.fin, p_kennzeichen := r.kennzeichen, p_hsn := r.hsn, p_tsn := r.tsn,
      p_hersteller := r.fahrzeug_hersteller, p_modell := r.fahrzeug_modell,
      p_kilometerstand := r.kilometerstand);
    IF v_vehicle_id IS NULL THEN CONTINUE; END IF;

    UPDATE public.vehicles SET
      bauart = COALESCE(r.fahrzeug_typ, bauart),
      farbe_klartext = COALESCE(r.fahrzeug_farbe, farbe_klartext),
      farbcode = COALESCE(r.lackfarbe_code, farbcode),
      kennzeichen_buchstaben = COALESCE(r.kennzeichen_buchstaben, kennzeichen_buchstaben),
      fahrzeug_ausstattung = COALESCE(r.fahrzeug_ausstattung, fahrzeug_ausstattung),
      fin_quelle = COALESCE(r.fin_quelle, fin_quelle),
      fin_extrahiert_am = COALESCE(r.fin_extrahiert_am, fin_extrahiert_am),
      baujahr_monat = COALESCE(
        CASE WHEN r.fahrzeug_baujahr BETWEEN 1900 AND 2100 THEN make_date(r.fahrzeug_baujahr, 1, 1) END,
        baujahr_monat)
    WHERE id = v_vehicle_id;

    UPDATE public.claims SET vehicle_id = v_vehicle_id WHERE id = r.claim_id AND vehicle_id IS NULL;
    UPDATE public.claim_parties SET vehicle_id = v_vehicle_id
      WHERE claim_id = r.claim_id AND rolle = 'geschaedigter' AND vehicle_id IS NULL;
    INSERT INTO public.claim_vehicle_involvements (claim_id, vehicle_id, rolle)
      SELECT r.claim_id, v_vehicle_id, 'geschaedigter'
      WHERE NOT EXISTS (SELECT 1 FROM public.claim_vehicle_involvements x
                        WHERE x.claim_id = r.claim_id AND x.vehicle_id = v_vehicle_id);
  END LOOP;
END $$;
