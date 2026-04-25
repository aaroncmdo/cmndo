-- AAR-810 A.2.5: Backfill aus faelle.halter_*, faelle.gegner_*, faelle.zeugen_kontakte
-- Idempotent: kann mehrfach ausgeführt werden ohne Duplikate.

-- Stufe A: Geschädigter aus halter_*-Snapshot

WITH new_geschaedigte AS (
  INSERT INTO public.claim_parties (
    claim_id, rolle, reihenfolge, user_id,
    vorname, nachname, geburtsdatum,
    telefon, email,
    adresse_strasse, adresse_plz, adresse_ort,
    ist_halter, ist_fahrer,
    kennzeichen, vehicle_id,
    quelle, created_at, created_by_user_id
  )
  SELECT
    f.claim_id,
    'geschaedigter',
    1,
    f.kunde_id,
    COALESCE(f.halter_vorname, f.kunde_vorname),
    COALESCE(f.halter_nachname, f.kunde_nachname, '(unbekannt)'),
    f.halter_geburtsdatum,
    COALESCE(f.halter_telefon, f.kunde_telefon),
    COALESCE(f.halter_email, f.kunde_email),
    COALESCE(f.halter_strasse, f.kunde_strasse),
    COALESCE(f.halter_plz, f.kunde_plz),
    COALESCE(f.halter_stadt, f.kunde_stadt),
    COALESCE(f.ist_fahrzeughalter, TRUE),
    COALESCE(NOT f.halter_ungleich_fahrer_flag, TRUE),
    f.kennzeichen,
    f.vehicle_id,
    'backfill_aar810_a2',
    f.created_at,
    f.kundenbetreuer_id
  FROM public.faelle f
  WHERE f.claim_id IS NOT NULL
    AND (f.kunde_id IS NOT NULL
         OR f.halter_vorname IS NOT NULL
         OR f.halter_nachname IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.claim_parties cp
      WHERE cp.claim_id = f.claim_id AND cp.rolle = 'geschaedigter'
    )
  RETURNING id, claim_id
)
UPDATE public.claims c
   SET geschaedigter_party_id = ng.id
  FROM new_geschaedigte ng
 WHERE c.id = ng.claim_id
   AND c.geschaedigter_party_id IS NULL;

-- Stufe B: Verursacher aus gegner_*-Snapshot

WITH new_verursacher AS (
  INSERT INTO public.claim_parties (
    claim_id, rolle, reihenfolge, user_id,
    nachname, firma, ist_gewerbe,
    kennzeichen,
    versicherung_id, versicherungsnummer, versicherungs_aktenzeichen,
    quelle, created_at, created_by_user_id
  )
  SELECT
    f.claim_id,
    'verursacher',
    2,
    NULL,
    CASE
      WHEN f.gegner_name ~* '\m(GmbH|AG|KG|UG|GbR|e\.K\.|e\.V\.|OHG)\M'
        THEN NULL
      ELSE COALESCE(f.gegner_name, '(unbekannter Halter)')
    END,
    CASE
      WHEN f.gegner_name ~* '\m(GmbH|AG|KG|UG|GbR|e\.K\.|e\.V\.|OHG)\M'
        THEN f.gegner_name
      ELSE NULL
    END,
    COALESCE(f.gegner_name ~* '\m(GmbH|AG|KG|UG|GbR|e\.K\.|e\.V\.|OHG)\M', FALSE),
    f.gegner_kennzeichen,
    f.gegner_versicherung_id,
    f.gegner_versicherungsnummer,
    f.gegner_schadennummer,
    'backfill_aar810_a2',
    f.created_at,
    f.kundenbetreuer_id
  FROM public.faelle f
  WHERE f.claim_id IS NOT NULL
    AND (f.gegner_name IS NOT NULL
         OR f.gegner_kennzeichen IS NOT NULL
         OR f.gegner_versicherung_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.claim_parties cp
      WHERE cp.claim_id = f.claim_id AND cp.rolle = 'verursacher'
    )
  RETURNING id, claim_id
)
UPDATE public.claims c
   SET verursacher_party_id = nv.id
  FROM new_verursacher nv
 WHERE c.id = nv.claim_id
   AND c.verursacher_party_id IS NULL;

-- Stufe C: Zeugen aus zeugen_kontakte jsonb
-- Struktur: [{vorname, nachname, telefon, email}, ...] oder [{name, telefon}]

INSERT INTO public.claim_parties (
  claim_id, rolle, reihenfolge,
  vorname, nachname, telefon, email,
  quelle, created_at, notiz
)
SELECT
  f.claim_id,
  'zeuge',
  10 + row_number() OVER (PARTITION BY f.claim_id ORDER BY ord) AS reihenfolge,
  zeuge->>'vorname',
  COALESCE(zeuge->>'nachname', zeuge->>'name', '(unbekannt)'),
  zeuge->>'telefon',
  zeuge->>'email',
  'backfill_aar810_a2_zeugen',
  f.created_at,
  CASE
    WHEN zeuge ? 'notiz' THEN zeuge->>'notiz'
    ELSE 'Aus zeugen_kontakte jsonb migriert — Detailprüfung empfohlen'
  END
FROM public.faelle f
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(f.zeugen_kontakte) = 'array' THEN f.zeugen_kontakte
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS t(zeuge, ord)
WHERE f.claim_id IS NOT NULL
  AND f.zeugen_kontakte IS NOT NULL
  AND jsonb_typeof(f.zeugen_kontakte) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.claim_parties cp
    WHERE cp.claim_id = f.claim_id
      AND cp.quelle = 'backfill_aar810_a2_zeugen'
  );

-- Stufe D: personenschaden_personen → claim_parties (rolle='beifahrer')
-- Heute 0 Rows — defensiv.

INSERT INTO public.claim_parties (
  claim_id, rolle, reihenfolge,
  vorname, nachname, geburtsdatum,
  hat_personenschaden, verletzungsart, ist_fahrzeuginsasse,
  quelle, created_at, notiz
)
SELECT
  f.claim_id,
  'beifahrer',
  20 + row_number() OVER (PARTITION BY pp.fall_id ORDER BY pp.created_at),
  pp.vorname,
  COALESCE(pp.nachname, '(unbekannt)'),
  pp.geburtsdatum,
  TRUE,
  pp.verletzungsart,
  pp.ist_fahrzeuginsasse,
  'backfill_aar810_a2_personenschaden',
  pp.created_at,
  pp.notizen
FROM public.personenschaden_personen pp
JOIN public.faelle f ON f.id = pp.fall_id
WHERE f.claim_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.claim_parties cp
    WHERE cp.claim_id = f.claim_id
      AND cp.quelle = 'backfill_aar810_a2_personenschaden'
      AND cp.vorname IS NOT DISTINCT FROM pp.vorname
      AND cp.nachname = COALESCE(pp.nachname, '(unbekannt)')
  );

-- Statistik
DO $$
DECLARE
  v_total          INT;
  v_geschaedigte   INT;
  v_verursacher    INT;
  v_zeugen         INT;
  v_beifahrer      INT;
  v_with_user      INT;
  v_with_vehicle   INT;
  v_claims_with_geschaedigter_party INT;
  v_claims_with_verursacher_party   INT;
BEGIN
  SELECT count(*) INTO v_total           FROM public.claim_parties WHERE quelle LIKE 'backfill_aar810_a2%';
  SELECT count(*) INTO v_geschaedigte    FROM public.claim_parties WHERE quelle = 'backfill_aar810_a2' AND rolle = 'geschaedigter';
  SELECT count(*) INTO v_verursacher     FROM public.claim_parties WHERE quelle = 'backfill_aar810_a2' AND rolle = 'verursacher';
  SELECT count(*) INTO v_zeugen          FROM public.claim_parties WHERE quelle = 'backfill_aar810_a2_zeugen';
  SELECT count(*) INTO v_beifahrer       FROM public.claim_parties WHERE quelle = 'backfill_aar810_a2_personenschaden';
  SELECT count(*) INTO v_with_user       FROM public.claim_parties WHERE quelle LIKE 'backfill_aar810_a2%' AND user_id IS NOT NULL;
  SELECT count(*) INTO v_with_vehicle    FROM public.claim_parties WHERE quelle LIKE 'backfill_aar810_a2%' AND vehicle_id IS NOT NULL;
  SELECT count(*) INTO v_claims_with_geschaedigter_party FROM public.claims WHERE geschaedigter_party_id IS NOT NULL;
  SELECT count(*) INTO v_claims_with_verursacher_party   FROM public.claims WHERE verursacher_party_id IS NOT NULL;

  RAISE NOTICE '
    AAR-810 Phase A.2 Backfill abgeschlossen.
    claim_parties gesamt (backfill):        %
      Geschädigte (Stufe A):                %
      Verursacher (Stufe B):                %
      Zeugen (Stufe C aus jsonb):           %
      Beifahrer (Stufe D, Personenschaden): %
    Davon mit user_id:                      %
    Davon mit vehicle_id:                   %

    claims mit geschaedigter_party_id:      %
    claims mit verursacher_party_id:        %

    Nächste Schritte:
      Phase A.3: airdrop_invitations + profiles.account_typ Erweiterung
      Phase A.4: inviteGegnerViaAirdrop Server-Action
      Phase A.6: faelle.claim_id NOT NULL nach Daten-Audit',
    v_total, v_geschaedigte, v_verursacher, v_zeugen, v_beifahrer,
    v_with_user, v_with_vehicle,
    v_claims_with_geschaedigter_party, v_claims_with_verursacher_party;
END $$;
