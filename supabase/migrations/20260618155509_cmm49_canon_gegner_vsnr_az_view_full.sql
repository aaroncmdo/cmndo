-- CMM-49 Tier-2 Kanonisierung: gegner_versicherungsnummer/gegner_aktenzeichen
-- in v_claim_full aus der verursacher-claim_party sourcen (COALESCE party, claims).
-- Schritt 1/N (View). Daten quasi leer (1/84) -> auf aktuellen Daten BYTE-IDENTISCH;
-- die party-Quelle greift erst nach dem Writer-Repoint. gegner_versicherung_id /
-- gegnerisches_vehicle_id (FKs mit Join-Deps) + auth-gated/legacy Views (v_claim_sv,
-- v_faelle) folgen separat. Fail-loud: RAISE wenn ein Anchor fehlt -> Migration atomar fehl.
DO $mig$
DECLARE
  v_new text;
BEGIN
  v_new := pg_get_viewdef('public.v_claim_full'::regclass, true);

  IF strpos(v_new, 'COALESCE(gp.versicherungsnummer') > 0 THEN
    RAISE EXCEPTION 'v_claim_full gegner-canon already applied';
  END IF;

  -- 1) verursacher (gp) LATERAL um versicherungsnummer + versicherungs_aktenzeichen erweitern
  IF strpos(v_new, 'SELECT vp.firma_id,') = 0 THEN
    RAISE EXCEPTION 'anchor [gp lateral: SELECT vp.firma_id,] not found';
  END IF;
  v_new := replace(v_new,
    'SELECT vp.firma_id,',
    'SELECT vp.firma_id,
            vp.versicherungsnummer,
            vp.versicherungs_aktenzeichen,');

  -- 2) gegner_versicherungsnummer aus verursacher-Party sourcen
  IF strpos(v_new, 'c.gegner_versicherungsnummer,') = 0 THEN
    RAISE EXCEPTION 'anchor [output: c.gegner_versicherungsnummer,] not found';
  END IF;
  v_new := replace(v_new,
    'c.gegner_versicherungsnummer,',
    'COALESCE(gp.versicherungsnummer, c.gegner_versicherungsnummer) AS gegner_versicherungsnummer,');

  -- 3) gegner_aktenzeichen aus verursacher-Party sourcen
  IF strpos(v_new, 'c.gegner_aktenzeichen,') = 0 THEN
    RAISE EXCEPTION 'anchor [output: c.gegner_aktenzeichen,] not found';
  END IF;
  v_new := replace(v_new,
    'c.gegner_aktenzeichen,',
    'COALESCE(gp.versicherungs_aktenzeichen, c.gegner_aktenzeichen) AS gegner_aktenzeichen,');

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || v_new;
END
$mig$;
