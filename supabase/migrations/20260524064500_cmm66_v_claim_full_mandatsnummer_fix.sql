-- CMM-66: v_claim_full.mandatsnummer Live-Stale-Fix.
-- Die View las mandatsnummer aus faelle (f.mandatsnummer). Seit CMM-44 SP-I2 (#1570/#1581)
-- lebt mandatsnummer auf kanzlei_faelle (SSoT) — faelle.mandatsnummer ist fuer neue Faelle null
-- => die View lieferte schon JETZT stale/null mandatsnummer. kf ist bereits gejoint
-- (LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id) -> Quelle f. -> kf.
--
-- Server-seitig via pg_get_viewdef + replace, um die 100-Zeilen-View (LATERAL/jsonb_agg)
-- nicht von Hand zu rekonstruieren (Transkriptionsfehler-Risiko). Guard: bricht, falls das
-- Token nicht (mehr) existiert -> dann hat sich die View-Def geaendert und die Migration ist zu pruefen.
DO $$
DECLARE v text;
BEGIN
  v := pg_get_viewdef('v_claim_full'::regclass, true);
  IF position('f.mandatsnummer,' IN v) = 0 THEN
    RAISE EXCEPTION 'CMM-66: f.mandatsnummer, nicht in v_claim_full gefunden — View-Def geaendert, Migration pruefen';
  END IF;
  v := replace(v, 'f.mandatsnummer,', 'kf.mandatsnummer,');
  EXECUTE 'CREATE OR REPLACE VIEW v_claim_full AS ' || v;
END $$;
