-- CMM-49 Tier-2 gegner-Kanonisierung: v_faelle + v_claim_sv View-Steps (Rest-Prep).
-- gegner_versicherungsnummer/gegner_aktenzeichen aus der verursacher-claim_party sourcen
-- (COALESCE party, claims) -- analog v_claim_full #3004. Beide Views haben noch KEINEN
-- verursacher-LATERAL -> einschieben. Daten quasi leer (party vsnr/az NULL) -> v_faelle
-- byte-identisch (md5 cfc1be54 before==after verifiziert). v_claim_sv ist auth-gated
-- (security_invoker=false; WHERE is_sv_for_claim ist die Grenze) -> reloptions EXPLIZIT
-- erhalten; der per-claim-LATERAL leakt nicht. Fail-loud: RAISE wenn Anchor fehlt ->
-- Migration atomar fehl. DO-block liest die LIVE def (post-kunde_email-cutover) -> kein
-- Clobber paralleler View-Recreates.

-- == v_faelle_mit_aktuellem_termin (reloptions null/default) ==================
DO $mig$
DECLARE v_new text;
BEGIN
  v_new := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  IF strpos(v_new, 'COALESCE(vp_g.versicherungsnummer') > 0 THEN
    RAISE EXCEPTION 'v_faelle gegner-canon already applied';
  END IF;
  IF strpos(v_new, 'LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;') = 0 THEN
    RAISE EXCEPTION 'anchor [v_faelle: v_claim_phase join] not found';
  END IF;
  v_new := replace(v_new,
    'LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;',
    'LEFT JOIN LATERAL ( SELECT vpp.versicherungsnummer, vpp.versicherungs_aktenzeichen FROM claim_parties vpp WHERE vpp.claim_id = c.id AND vpp.rolle = ''verursacher''::text ORDER BY vpp.reihenfolge, vpp.created_at LIMIT 1) vp_g ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;');
  IF strpos(v_new, 'c.gegner_versicherungsnummer,') = 0 THEN
    RAISE EXCEPTION 'anchor [v_faelle: c.gegner_versicherungsnummer,] not found';
  END IF;
  v_new := replace(v_new,
    'c.gegner_versicherungsnummer,',
    'COALESCE(vp_g.versicherungsnummer, c.gegner_versicherungsnummer) AS gegner_versicherungsnummer,');
  IF strpos(v_new, 'c.gegner_aktenzeichen AS gegner_schadennummer,') = 0 THEN
    RAISE EXCEPTION 'anchor [v_faelle: gegner_schadennummer] not found';
  END IF;
  v_new := replace(v_new,
    'c.gegner_aktenzeichen AS gegner_schadennummer,',
    'COALESCE(vp_g.versicherungs_aktenzeichen, c.gegner_aktenzeichen) AS gegner_schadennummer,');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_new;
END $mig$;

-- == v_claim_sv (auth-gated, security_invoker=false EXPLIZIT erhalten) =========
DO $mig$
DECLARE v_new text;
BEGIN
  v_new := pg_get_viewdef('public.v_claim_sv'::regclass, true);
  IF strpos(v_new, 'COALESCE(vp_g.versicherungsnummer') > 0 THEN
    RAISE EXCEPTION 'v_claim_sv gegner-canon already applied';
  END IF;
  IF strpos(v_new, 'FROM claims c') = 0 THEN
    RAISE EXCEPTION 'anchor [v_claim_sv: FROM claims c] not found';
  END IF;
  v_new := replace(v_new,
    'FROM claims c',
    'FROM claims c
     LEFT JOIN LATERAL ( SELECT vpp.versicherungsnummer, vpp.versicherungs_aktenzeichen FROM claim_parties vpp WHERE vpp.claim_id = c.id AND vpp.rolle = ''verursacher''::text ORDER BY vpp.reihenfolge, vpp.created_at LIMIT 1) vp_g ON true');
  IF strpos(v_new, 'is_sv_for_claim(id)') = 0 THEN
    RAISE EXCEPTION 'anchor [v_claim_sv: is_sv_for_claim(id)] not found';
  END IF;
  v_new := replace(v_new, 'is_sv_for_claim(id)', 'is_sv_for_claim(c.id)');
  IF strpos(v_new, 'gegner_versicherungsnummer,') = 0 THEN
    RAISE EXCEPTION 'anchor [v_claim_sv: gegner_versicherungsnummer,] not found';
  END IF;
  v_new := replace(v_new,
    'gegner_versicherungsnummer,',
    'COALESCE(vp_g.versicherungsnummer, gegner_versicherungsnummer) AS gegner_versicherungsnummer,');
  IF strpos(v_new, 'gegner_aktenzeichen,') = 0 THEN
    RAISE EXCEPTION 'anchor [v_claim_sv: gegner_aktenzeichen,] not found';
  END IF;
  v_new := replace(v_new,
    'gegner_aktenzeichen,',
    'COALESCE(vp_g.versicherungs_aktenzeichen, gegner_aktenzeichen) AS gegner_aktenzeichen,');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_sv WITH (security_invoker = false) AS ' || v_new;
END $mig$;
