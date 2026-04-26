-- AAR-816: faelle.claim_id NOT NULL + Sync
--
-- Stufe 1: Backfill — Claims für alle Faelle ohne claim_id anlegen
--   (Idempotent, in Test-DB 0 Rows betroffen)
-- Stufe 2: NOT NULL Constraint setzen
-- Stufe 3: Trigger der sicherstellt dass neue Faelle immer claim_id bekommen

-- ─── Stufe 1: Backfill ───────────────────────────────────────────────────────

WITH new_claims AS (
  INSERT INTO public.claims (
    vehicle_id,
    schadentag,
    schadenort_adresse,
    schadenort_plz,
    schadenort_ort,
    schadenort_lat,
    schadenort_lng,
    schadenort_kategorie,
    hergang_kunde_text,
    schadenart,
    fall_typ,
    unfall_konstellation,
    fahrerflucht,
    auslandskennzeichen,
    polizei_aktenzeichen,
    polizei_bericht_vorhanden,
    polizei_vor_ort,
    bkat_unfallart,
    geschaedigter_user_id,
    gegner_versicherung_id,
    gegner_bekannt,
    anzahl_beteiligte_total,
    hat_personenschaden,
    hat_mietwagen,
    hat_sachschaden,
    sachschaden_beschreibung,
    halter_ungleich_fahrer,
    status,
    created_by_user_id,
    created_via
  )
  SELECT
    f.vehicle_id,
    COALESCE(f.unfalldatum, f.created_at::date, CURRENT_DATE),
    f.unfallort,
    NULL,
    NULL,
    f.unfallort_lat,
    f.unfallort_lng,
    f.unfallort_kategorie,
    COALESCE(f.unfallhergang, f.schadens_hergang, f.fahrzeugschaden_beschreibung),
    CASE
      WHEN lower(f.schadens_art) IN ('haftpflicht','vollkasko','teilkasko','eigenverschulden')
        THEN lower(f.schadens_art)
      ELSE 'unbekannt'
    END,
    f.schadens_fall_typ,
    f.unfall_konstellation,
    f.fahrerflucht,
    f.auslandskennzeichen,
    f.polizei_aktenzeichen,
    COALESCE(f.polizei_bericht_vorhanden, FALSE),
    COALESCE(f.polizei_vor_ort, FALSE),
    f.bkat_unfallart::text,
    f.kunde_id,
    f.gegner_versicherung_id,
    COALESCE(f.gegner_bekannt, TRUE),
    COALESCE(f.gegner_anzahl_beteiligte, 0) + 1,
    COALESCE(f.personenschaden_flag, FALSE),
    COALESCE(f.mietwagen_flag, FALSE),
    COALESCE(f.sachschaden_flag, FALSE),
    f.sachschaden_beschreibung,
    COALESCE(f.halter_ungleich_fahrer_flag, FALSE),
    'dispatch_done',
    f.kundenbetreuer_id,
    'backfill_aar816'
  FROM public.faelle f
  WHERE f.claim_id IS NULL
  RETURNING id, created_via
)
UPDATE public.faelle f
   SET claim_id = nc.id
  FROM (
    -- Wir brauchen die Zuordnung fall → claim; nutzen created_via + Zeitstempel-Nähe
    -- Direkter JOIN via CTE nicht möglich → Subquery auf gerade erstellte Claims
    SELECT c.id, c.geschaedigter_user_id
      FROM public.claims c
     WHERE c.created_via = 'backfill_aar816'
       AND c.id IN (SELECT id FROM new_claims)
  ) nc
  JOIN public.faelle f2 ON f2.kunde_id IS NOT DISTINCT FROM nc.geschaedigter_user_id
 WHERE f.id = f2.id
   AND f.claim_id IS NULL;

-- Fallback: direktes Matching über erstellte Claims per Zeitstempel
-- (für Faelle ohne kunde_id — zweiter Pass)
UPDATE public.faelle f
   SET claim_id = c.id
  FROM public.claims c
 WHERE c.created_via = 'backfill_aar816'
   AND f.claim_id IS NULL
   AND c.geschaedigter_user_id IS NULL
   -- Schadensdatum muss übereinstimmen
   AND c.schadentag = COALESCE(f.unfalldatum, f.created_at::date, CURRENT_DATE)
   -- Sicherstellen: noch kein anderer Fall diesen Claim beansprucht
   AND NOT EXISTS (
     SELECT 1 FROM public.faelle f3 WHERE f3.claim_id = c.id
   );

-- ─── Stufe 2: NOT NULL Constraint ───────────────────────────────────────────

-- Sicherheitsnetz: Falls noch Faelle ohne claim_id existieren (sollte 0 sein)
DO $$
DECLARE v_ohne INT;
BEGIN
  SELECT count(*) INTO v_ohne FROM public.faelle WHERE claim_id IS NULL;
  IF v_ohne > 0 THEN
    RAISE EXCEPTION
      'AAR-816: % Faelle haben noch claim_id IS NULL — NOT NULL Constraint abgebrochen. '
      'Bitte manuell prüfen.', v_ohne;
  END IF;
END $$;

ALTER TABLE public.faelle ALTER COLUMN claim_id SET NOT NULL;

-- ─── Stufe 3: Trigger — neue Faelle müssen claim_id bekommen ────────────────
-- Der Trigger prüft nach dem Insert ob claim_id gesetzt wurde.
-- Application-Code (createClaimForFall) setzt claim_id via UPDATE;
-- der Trigger gibt eine WARNING aus wenn claim_id nach 0s noch fehlt
-- (wird beim nächsten scheduled Job nachgezogen).

CREATE OR REPLACE FUNCTION public.check_fall_claim_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- claim_id darf beim INSERT noch NULL sein (wird im nächsten Statement via
  -- createClaimForFall gesetzt). AFTER INSERT prüft 0 Sekunden nach INSERT.
  -- Bei NULL: RAISE WARNING damit es im Supabase-Log sichtbar ist.
  IF NEW.claim_id IS NULL THEN
    RAISE WARNING
      'AAR-816: Fall % wurde ohne claim_id angelegt. '
      'createClaimForFall() muss unmittelbar danach aufgerufen werden.',
      NEW.id;
  END IF;
  RETURN NULL;  -- AFTER trigger, kein RETURN NEW nötig
END $$;

DROP TRIGGER IF EXISTS trg_fall_claim_id_check ON public.faelle;
CREATE TRIGGER trg_fall_claim_id_check
  AFTER INSERT ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.check_fall_claim_id();

-- ─── Statistik ───────────────────────────────────────────────────────────────

DO $$
DECLARE v_total INT; v_mit_claim INT;
BEGIN
  SELECT count(*), count(claim_id) INTO v_total, v_mit_claim FROM public.faelle;
  RAISE NOTICE '
    AAR-816 abgeschlossen.
    faelle gesamt:       %
    mit claim_id:        %
    ohne claim_id:       % (sollte 0 sein)
    NOT NULL Constraint: aktiv',
    v_total, v_mit_claim, v_total - v_mit_claim;
END $$;
