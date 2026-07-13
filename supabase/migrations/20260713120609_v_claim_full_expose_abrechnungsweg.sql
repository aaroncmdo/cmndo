-- #2 pure-derived Layer B: v_claim_full reicht die derived abrechnungsweg-Spalte aus v_claim_base durch
-- (base.abrechnungsweg als letzte Spalte angehaengt — CREATE OR REPLACE-append). Damit lesen Code-Consumer,
-- die getKundeFallDetailRecord/v_claim_full nutzen (u.a. kunde-claim-view.ts fall.abrechnungsweg), die
-- derived-Ableitung statt der stale claims.abrechnungsweg-Spalte.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_full'::regclass, true);
  IF (length(d)-length(replace(d,'    sprache
   FROM v_claim_base base;','')))/length('    sprache
   FROM v_claim_base base;') <> 1 THEN
    RAISE EXCEPTION 'v_claim_full expose: Anchor-Count != 1 — Abbruch';
  END IF;
  nd := replace(d,
    '    sprache
   FROM v_claim_base base;',
    '    sprache,
    base.abrechnungsweg
   FROM v_claim_base base;');
  IF position('base.abrechnungsweg
   FROM v_claim_base base;' in nd) = 0 THEN
    RAISE EXCEPTION 'v_claim_full expose: Transform unvollstaendig — Abbruch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || nd;
END $$;
