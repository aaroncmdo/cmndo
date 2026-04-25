-- AAR-773 Phase 1.5: SECURITY DEFINER RPC für idempotente Vehicle-Erstellung
-- Wird von ZB1-OCR-Action, Lead-Konversion und manueller Vehicle-Anlage aufgerufen.

CREATE OR REPLACE FUNCTION public.upsert_vehicle_by_fin(
  p_fin            VARCHAR(17),
  p_kennzeichen    VARCHAR(20)  DEFAULT NULL,
  p_hsn            VARCHAR(4)   DEFAULT NULL,
  p_tsn            VARCHAR(3)   DEFAULT NULL,
  p_hersteller     TEXT         DEFAULT NULL,
  p_modell         TEXT         DEFAULT NULL,
  p_owner_id       UUID         DEFAULT NULL,
  p_quelle         TEXT         DEFAULT 'manual',
  p_kilometerstand INTEGER      DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_old_owner UUID;
BEGIN
  -- FIN-Validierung (defensive — Edge-Function sollte vorher prüfen)
  IF p_fin IS NULL OR length(trim(p_fin)) <> 17 THEN
    RAISE EXCEPTION 'FIN muss genau 17 Zeichen lang sein. Erhalten: %', p_fin
      USING ERRCODE = '22023';
  END IF;
  IF p_fin ~ '[ILOQ]' THEN
    RAISE EXCEPTION 'FIN enthält ungültige Zeichen (I, L, O, Q sind in ISO 3779 nicht erlaubt). Erhalten: %', p_fin
      USING ERRCODE = '22023';
  END IF;

  -- Bestehenden Owner für Halterwechsel-Detection holen
  SELECT current_owner_id INTO v_old_owner FROM public.vehicles WHERE fin = p_fin;

  -- Vehicle anlegen oder ergänzen
  INSERT INTO public.vehicles (
    fin, kennzeichen_aktuell, hsn, tsn, hersteller, modell_haupttyp,
    current_owner_id, aktueller_kilometerstand, aktueller_kilometerstand_at
  )
  VALUES (
    p_fin, p_kennzeichen, p_hsn, p_tsn,
    COALESCE(p_hersteller, 'Unbekannt'),
    p_modell, p_owner_id, p_kilometerstand,
    CASE WHEN p_kilometerstand IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (fin) DO UPDATE SET
    kennzeichen_aktuell = COALESCE(EXCLUDED.kennzeichen_aktuell, public.vehicles.kennzeichen_aktuell),
    hsn = COALESCE(EXCLUDED.hsn, public.vehicles.hsn),
    tsn = COALESCE(EXCLUDED.tsn, public.vehicles.tsn),
    hersteller = CASE
                   WHEN public.vehicles.hersteller = 'Unbekannt'
                        AND EXCLUDED.hersteller IS NOT NULL
                        AND EXCLUDED.hersteller <> 'Unbekannt'
                   THEN EXCLUDED.hersteller
                   ELSE public.vehicles.hersteller
                 END,
    modell_haupttyp = COALESCE(EXCLUDED.modell_haupttyp, public.vehicles.modell_haupttyp),
    current_owner_id = COALESCE(EXCLUDED.current_owner_id, public.vehicles.current_owner_id),
    aktueller_kilometerstand = GREATEST(
      COALESCE(public.vehicles.aktueller_kilometerstand, 0),
      COALESCE(EXCLUDED.aktueller_kilometerstand, 0)
    ),
    aktueller_kilometerstand_at = CASE
      WHEN EXCLUDED.aktueller_kilometerstand IS NOT NULL
        AND (public.vehicles.aktueller_kilometerstand IS NULL
             OR EXCLUDED.aktueller_kilometerstand > public.vehicles.aktueller_kilometerstand)
      THEN now()
      ELSE public.vehicles.aktueller_kilometerstand_at
    END,
    updated_at = now()
  RETURNING id INTO v_id;

  -- Halterwechsel-Detection: Wenn neuer Owner abweicht, alte Ownership schließen + neue öffnen
  IF p_owner_id IS NOT NULL AND v_old_owner IS DISTINCT FROM p_owner_id THEN
    UPDATE public.vehicle_ownership_history
       SET bis = CURRENT_DATE
     WHERE vehicle_id = v_id
       AND bis IS NULL
       AND user_id IS DISTINCT FROM p_owner_id;

    INSERT INTO public.vehicle_ownership_history (vehicle_id, user_id, von, quelle)
    SELECT v_id, p_owner_id, CURRENT_DATE, p_quelle
    WHERE NOT EXISTS (
      SELECT 1 FROM public.vehicle_ownership_history
      WHERE vehicle_id = v_id AND user_id = p_owner_id AND bis IS NULL
    );
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.upsert_vehicle_by_fin IS 'AAR-773: Idempotente Vehicle-Erstellung über FIN. SECURITY DEFINER für Server-Action-Aufrufe. Detektiert Halterwechsel und pflegt vehicle_ownership_history automatisch.';

REVOKE ALL ON FUNCTION public.upsert_vehicle_by_fin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_vehicle_by_fin TO authenticated, service_role;
