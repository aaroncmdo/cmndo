-- AAR-773 Phase 1.4: Backfill aus faelle + leads
-- Idempotent: kann mehrfach ausgeführt werden ohne Duplikate.

-- Stufe A: Distinct FINs aus faelle (Vorrang) und leads in vehicles INSERT/UPDATE

WITH source AS (
  -- Faelle haben Vorrang (sind weiter im Prozess)
  SELECT
    f.fin_vin AS fin,
    f.kennzeichen,
    f.hsn,
    f.tsn,
    f.fahrzeug_hersteller AS hersteller,
    f.fahrzeug_modell AS modell_haupttyp,
    f.fahrzeug_typ AS bauart,
    f.fahrzeug_farbe AS farbe_klartext,
    public.safe_to_date(f.erstzulassung) AS erstzulassung,
    f.kilometerstand,
    f.kunde_id AS halter_user_id,
    f.created_at,
    1 AS prioritaet
  FROM public.faelle f
  WHERE f.fin_vin IS NOT NULL
    AND length(trim(f.fin_vin)) = 17
    AND f.fin_vin !~ '[ILOQ]'  -- ungültige FIN-Zeichen filtern (ISO 3779)

  UNION ALL

  SELECT
    l.fin AS fin,
    l.kennzeichen,
    l.hsn,
    l.tsn,
    l.fahrzeug_hersteller,
    l.fahrzeug_modell,
    NULL::text AS bauart,
    l.fahrzeug_farbe,
    public.safe_to_date(l.erstzulassung) AS erstzulassung,
    l.kilometerstand,
    NULL::uuid AS halter_user_id,  -- leads haben keine kunde_id
    l.created_at,
    2 AS prioritaet
  FROM public.leads l
  WHERE l.fin IS NOT NULL
    AND length(trim(l.fin)) = 17
    AND l.fin !~ '[ILOQ]'
),
deduped AS (
  -- Pro FIN nur die "beste" Source-Row nehmen (faelle vor leads, dann jüngste)
  SELECT DISTINCT ON (fin)
    fin, kennzeichen, hsn, tsn, hersteller, modell_haupttyp, bauart,
    farbe_klartext, erstzulassung, kilometerstand, halter_user_id, created_at
  FROM source
  ORDER BY fin, prioritaet ASC, created_at DESC
)
INSERT INTO public.vehicles (
  fin, kennzeichen_aktuell, hsn, tsn,
  hersteller, modell_haupttyp, bauart, farbe_klartext,
  erstzulassung, aktueller_kilometerstand, aktueller_kilometerstand_at,
  current_owner_id, created_at
)
SELECT
  fin,
  kennzeichen,
  hsn, tsn,
  COALESCE(hersteller, 'Unbekannt'),  -- Hersteller ist NOT NULL
  modell_haupttyp,
  bauart,
  farbe_klartext,
  erstzulassung,
  kilometerstand,
  CASE WHEN kilometerstand IS NOT NULL THEN created_at ELSE NULL END,
  halter_user_id,
  created_at
FROM deduped
ON CONFLICT (fin) DO UPDATE SET
  -- Bei bestehendem Vehicle: nur leere Felder ergänzen, niemals überschreiben
  kennzeichen_aktuell = COALESCE(public.vehicles.kennzeichen_aktuell, EXCLUDED.kennzeichen_aktuell),
  hsn                 = COALESCE(public.vehicles.hsn, EXCLUDED.hsn),
  tsn                 = COALESCE(public.vehicles.tsn, EXCLUDED.tsn),
  hersteller          = CASE
                          WHEN public.vehicles.hersteller = 'Unbekannt'
                          THEN COALESCE(EXCLUDED.hersteller, public.vehicles.hersteller)
                          ELSE public.vehicles.hersteller
                        END,
  modell_haupttyp     = COALESCE(public.vehicles.modell_haupttyp, EXCLUDED.modell_haupttyp),
  bauart              = COALESCE(public.vehicles.bauart, EXCLUDED.bauart),
  farbe_klartext      = COALESCE(public.vehicles.farbe_klartext, EXCLUDED.farbe_klartext),
  erstzulassung       = COALESCE(public.vehicles.erstzulassung, EXCLUDED.erstzulassung),
  aktueller_kilometerstand = GREATEST(
    COALESCE(public.vehicles.aktueller_kilometerstand, 0),
    COALESCE(EXCLUDED.aktueller_kilometerstand, 0)
  ),
  current_owner_id    = COALESCE(public.vehicles.current_owner_id, EXCLUDED.current_owner_id),
  updated_at          = now();

-- Stufe B: faelle.vehicle_id und leads.vehicle_id setzen

UPDATE public.faelle f
   SET vehicle_id = v.id
  FROM public.vehicles v
 WHERE f.fin_vin = v.fin AND f.vehicle_id IS NULL;

UPDATE public.leads l
   SET vehicle_id = v.id
  FROM public.vehicles v
 WHERE l.fin = v.fin AND l.vehicle_id IS NULL;

-- Stufe C: vehicle_ownership_history-Rows für aktuelle Halter erzeugen

INSERT INTO public.vehicle_ownership_history (
  vehicle_id, user_id, von, erwerbsart, quelle, created_at
)
SELECT
  v.id,
  v.current_owner_id,
  v.created_at::date,
  'unbekannt',
  'backfill_aar773',
  v.created_at
FROM public.vehicles v
WHERE v.current_owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_ownership_history voh
    WHERE voh.vehicle_id = v.id AND voh.bis IS NULL
  );

-- Backfill-Statistik (für Branch-Test-Verifizierung)
DO $$
DECLARE
  v_vehicles_count INT;
  v_faelle_with_vehicle INT;
  v_faelle_without_vehicle INT;
  v_leads_with_vehicle INT;
  v_leads_without_vehicle INT;
  v_owner_history_count INT;
BEGIN
  SELECT count(*) INTO v_vehicles_count FROM public.vehicles;
  SELECT count(*) INTO v_faelle_with_vehicle FROM public.faelle WHERE vehicle_id IS NOT NULL;
  SELECT count(*) INTO v_faelle_without_vehicle FROM public.faelle WHERE vehicle_id IS NULL;
  SELECT count(*) INTO v_leads_with_vehicle FROM public.leads WHERE vehicle_id IS NOT NULL;
  SELECT count(*) INTO v_leads_without_vehicle FROM public.leads WHERE vehicle_id IS NULL;
  SELECT count(*) INTO v_owner_history_count FROM public.vehicle_ownership_history;

  RAISE NOTICE '
    AAR-773 Backfill abgeschlossen.
    vehicles: %
    faelle mit vehicle_id: %
    faelle ohne vehicle_id (kein/ungültiger FIN): %
    leads mit vehicle_id: %
    leads ohne vehicle_id: %
    vehicle_ownership_history-Rows: %',
    v_vehicles_count, v_faelle_with_vehicle, v_faelle_without_vehicle,
    v_leads_with_vehicle, v_leads_without_vehicle, v_owner_history_count;
END $$;
