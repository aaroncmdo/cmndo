-- AAR-810 A.1.5: Backfill aus faelle
-- Idempotent: kann mehrfach ausgeführt werden ohne Duplikate.

-- Stufe A: Pro faelle-Row eine claims-Row anlegen

WITH new_claims AS (
  INSERT INTO public.claims (
    vehicle_id,
    schadentag, schadenzeit, entdeckt_am,
    schadenort_adresse, schadenort_plz, schadenort_ort, schadenort_land,
    schadenort_lat, schadenort_lng, schadenort_kategorie,
    hergang_kunde_text,
    schadenart, fall_typ, ursache, unfall_konstellation,
    fahrerflucht, auslandskennzeichen,
    polizei_aktenzeichen, polizei_bericht_vorhanden, polizei_vor_ort, polizeibericht_status,
    bkat_unfallart,
    geschaedigter_user_id, verursacher_user_id,
    gegnerisches_vehicle_id, gegner_versicherung_id,
    gegner_versicherungsnummer, gegner_aktenzeichen, gegner_bekannt,
    anzahl_beteiligte_total,
    hat_personenschaden, hat_mietwagen, hat_nutzungsausfall, hat_sachschaden,
    sachschaden_beschreibung, halter_ungleich_fahrer, kunden_konstellation,
    unfallskizze_url, unfallskizze_svg, unfallskizze_bestaetigt,
    unfallskizze_ablehnung_grund, unfallskizze_generiert_am,
    status,
    created_at, created_by_user_id, created_via
  )
  SELECT
    f.vehicle_id,
    -- Schadentag-Priorisierung: unfalldatum > schadens_datum > created_at::date
    COALESCE(f.unfalldatum, f.schadens_datum, f.created_at::date),
    public.safe_to_time(f.unfall_uhrzeit),
    f.schadens_entdeckt_am,
    -- Schadenort: unfallort > schadens_adresse
    COALESCE(f.unfallort, f.schadens_adresse),
    f.schadens_plz,
    f.schadens_ort,
    'DE',
    f.unfallort_lat,
    f.unfallort_lng,
    f.unfallort_kategorie,
    -- Hergang: unfallhergang > schadens_hergang > fahrzeugschaden_beschreibung
    COALESCE(f.unfallhergang, f.schadens_hergang, f.fahrzeugschaden_beschreibung),
    COALESCE(NULLIF(lower(trim(f.schadens_art)), ''), 'unbekannt'),
    f.schadens_fall_typ,
    f.schadens_ursache,
    f.unfall_konstellation,
    f.fahrerflucht,
    f.auslandskennzeichen,
    f.polizei_aktenzeichen,
    COALESCE(f.polizei_bericht_vorhanden, FALSE),
    COALESCE(f.polizei_vor_ort, FALSE),
    f.polizeibericht_status,
    f.bkat_unfallart::text,
    f.kunde_id,   -- geschaedigter_user_id
    NULL,         -- verursacher_user_id
    NULL,         -- gegnerisches_vehicle_id
    f.gegner_versicherung_id,
    f.gegner_versicherungsnummer,
    f.gegner_schadennummer,
    COALESCE(f.gegner_bekannt, TRUE),
    COALESCE(f.gegner_anzahl_beteiligte, 1) + 1,
    COALESCE(f.personenschaden_flag, FALSE),
    COALESCE(f.mietwagen_hat, f.mietwagen_flag, FALSE),
    COALESCE(f.nutzungsausfall, FALSE),
    COALESCE(f.sachschaden_flag, FALSE),
    f.sachschaden_beschreibung,
    COALESCE(f.halter_ungleich_fahrer_flag, FALSE),
    f.kunden_konstellation,
    f.unfallskizze_url,
    f.unfallskizze_svg,
    f.unfallskizze_bestaetigt,
    f.unfallskizze_ablehnung_grund,
    f.unfallskizze_generiert_am,
    CASE
      WHEN f.abgeschlossen_am IS NOT NULL THEN 'reguliert_vollstaendig'
      WHEN f.storniert_am IS NOT NULL THEN 'storniert'
      WHEN f.regulierung_betrag IS NOT NULL AND f.regulierung_betrag > 0 THEN 'reguliert_teilweise'
      ELSE 'offen'
    END,
    f.created_at,
    f.kundenbetreuer_id,
    'backfill_aar810_a1'
  FROM public.faelle f
  WHERE f.claim_id IS NULL
    AND (f.unfalldatum IS NOT NULL OR f.schadens_datum IS NOT NULL OR f.created_at IS NOT NULL)
  RETURNING id, schadentag, geschaedigter_user_id, vehicle_id
)
SELECT count(*) AS new_claims_count FROM new_claims;

-- Stufe B: faelle.claim_id setzen
UPDATE public.faelle f
   SET claim_id = c.id
  FROM public.claims c
 WHERE f.claim_id IS NULL
   AND c.created_via = 'backfill_aar810_a1'
   AND c.schadentag = COALESCE(f.unfalldatum, f.schadens_datum, f.created_at::date)
   AND (c.geschaedigter_user_id IS NOT DISTINCT FROM f.kunde_id);

-- Stufe C: claim_vehicle_involvements für jedes claim mit vehicle_id
INSERT INTO public.claim_vehicle_involvements (claim_id, vehicle_id, rolle, created_at)
SELECT c.id, c.vehicle_id, 'geschaedigter', c.created_at
  FROM public.claims c
 WHERE c.vehicle_id IS NOT NULL
   AND c.created_via = 'backfill_aar810_a1'
   AND NOT EXISTS (
     SELECT 1 FROM public.claim_vehicle_involvements cvi
      WHERE cvi.claim_id = c.id AND cvi.vehicle_id = c.vehicle_id
   );

-- Statistik
DO $$
DECLARE
  v_claims_total        INT;
  v_claims_backfilled   INT;
  v_claims_with_vehicle INT;
  v_faelle_with_claim   INT;
  v_faelle_without_claim INT;
  v_cvi_total           INT;
  v_offen               INT;
  v_haftpflicht         INT;
BEGIN
  SELECT count(*) INTO v_claims_total           FROM public.claims;
  SELECT count(*) INTO v_claims_backfilled      FROM public.claims WHERE created_via = 'backfill_aar810_a1';
  SELECT count(*) INTO v_claims_with_vehicle    FROM public.claims WHERE vehicle_id IS NOT NULL;
  SELECT count(*) INTO v_faelle_with_claim      FROM public.faelle WHERE claim_id IS NOT NULL;
  SELECT count(*) INTO v_faelle_without_claim   FROM public.faelle WHERE claim_id IS NULL;
  SELECT count(*) INTO v_cvi_total              FROM public.claim_vehicle_involvements;
  SELECT count(*) INTO v_offen                  FROM public.claims WHERE status = 'offen';
  SELECT count(*) INTO v_haftpflicht            FROM public.claims WHERE schadenart = 'haftpflicht';

  RAISE NOTICE '
    AAR-810 Phase A.1 Backfill abgeschlossen.
    claims gesamt:                         %
      davon backfilled aus faelle:         %
      davon mit vehicle_id (verlinkt):     %
    faelle mit claim_id:                   %
    faelle ohne claim_id:                  % (manuell prüfen)
    claim_vehicle_involvements:            %
    Status offen:                          %
    Haftpflicht-Claims (Verjährung 3J):    %',
    v_claims_total, v_claims_backfilled, v_claims_with_vehicle,
    v_faelle_with_claim, v_faelle_without_claim, v_cvi_total,
    v_offen, v_haftpflicht;
END $$;
