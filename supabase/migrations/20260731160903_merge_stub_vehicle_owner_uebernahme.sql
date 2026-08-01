-- K8 (P6): merge_stub_vehicle uebertraegt current_owner_id vom Stub aufs Target.
-- Ohne diesen Patch verliert ein frueh gebundener Kunde-Owner (finalizeKundeSetup auf
-- FIN-losem Stub) beim spaeteren FIN-Merge die Bindung (Stub wird geloescht, Target
-- bleibt owner-los). COALESCE-Semantik: ein bestehender Target-Owner wird NIE geclobbert.
CREATE OR REPLACE FUNCTION public.merge_stub_vehicle(p_stub uuid, p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_stub_fin text; v_target_fin text;
BEGIN
  IF p_stub = p_target THEN RAISE EXCEPTION 'merge_stub_vehicle: stub == target (%)', p_stub; END IF;
  SELECT fin INTO v_stub_fin FROM vehicles WHERE id = p_stub;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_stub_vehicle: stub % existiert nicht', p_stub; END IF;
  IF v_stub_fin IS NOT NULL THEN RAISE EXCEPTION 'merge_stub_vehicle: stub % hat FIN (kein Stub)', p_stub; END IF;
  SELECT fin INTO v_target_fin FROM vehicles WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_stub_vehicle: target % existiert nicht', p_target; END IF;
  IF v_target_fin IS NULL THEN RAISE EXCEPTION 'merge_stub_vehicle: target % ohne FIN', p_target; END IF;

  -- K8 (P6): Owner-Erhalt VOR dem Stub-Delete — Target behaelt einen bestehenden Owner
  -- (kein Clobber), sonst uebernimmt es den Stub-Owner (current_owner_id = K8-Halter-Achse).
  UPDATE vehicles t SET current_owner_id = s.current_owner_id
    FROM vehicles s
   WHERE t.id = p_target AND s.id = p_stub
     AND t.current_owner_id IS NULL AND s.current_owner_id IS NOT NULL;

  -- 6 Tabellen ohne vehicle_id-Unique: plain re-point
  UPDATE claims              SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE claim_parties       SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE claim_mietwagen     SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE leads               SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE repairs             SET vehicle_id = p_target WHERE vehicle_id = p_stub;
  UPDATE vehicle_vorschaeden SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- UNIQUE(claim_id, vehicle_id): kollidierende Stub-Row loeschen, Rest umhaengen
  DELETE FROM claim_vehicle_involvements civ WHERE civ.vehicle_id = p_stub
    AND EXISTS (SELECT 1 FROM claim_vehicle_involvements t WHERE t.claim_id = civ.claim_id AND t.vehicle_id = p_target);
  UPDATE claim_vehicle_involvements SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- UNIQUE(firma_id, vehicle_id): kollidierende Stub-Row loeschen, Rest umhaengen
  DELETE FROM flotten_fahrzeuge ff WHERE ff.vehicle_id = p_stub
    AND EXISTS (SELECT 1 FROM flotten_fahrzeuge t WHERE t.firma_id = ff.firma_id AND t.vehicle_id = p_target);
  UPDATE flotten_fahrzeuge SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  -- partial UNIQUE(fahrzeug_id) WHERE status='gebunden': kollidierende 'gebunden'-Stubkarte demoten, dann umhaengen
  UPDATE schadenkarten SET status = 'ersetzt'
    WHERE fahrzeug_id = p_stub AND status = 'gebunden'
      AND EXISTS (SELECT 1 FROM schadenkarten t WHERE t.fahrzeug_id = p_target AND t.status = 'gebunden');
  UPDATE schadenkarten SET fahrzeug_id = p_target WHERE fahrzeug_id = p_stub;

  -- partial UNIQUE(vehicle_id) WHERE bis IS NULL: kollidierende aktive Stub-Row schliessen, dann umhaengen
  UPDATE vehicle_ownership_history SET bis = now()
    WHERE vehicle_id = p_stub AND bis IS NULL
      AND EXISTS (SELECT 1 FROM vehicle_ownership_history t WHERE t.vehicle_id = p_target AND t.bis IS NULL);
  UPDATE vehicle_ownership_history SET vehicle_id = p_target WHERE vehicle_id = p_stub;

  DELETE FROM vehicles WHERE id = p_stub;
END; $function$;