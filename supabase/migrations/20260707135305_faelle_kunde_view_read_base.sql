-- Payment-Ledger Phase 2b: faelle_kunde_view liest auszahlung_kunde_* aus v_claim_base statt aus
-- eigenem Pivot-Join. Single-Mechanism (alle Views lesen base). Verhaltensidentisch
-- (base.auszahlung_kunde_betrag == p.kunde_ist). Eigener LEFT JOIN v_claim_payments entfaellt (redundant).
DO $mig$
DECLARE
  d text;
  a1 text := 'p.kunde_ist::numeric(10,2) AS auszahlung_kunde_betrag';
  a2 text := 'p.kunde_am AS auszahlung_kunde_eingegangen_am';
  a3 text := E'\n     LEFT JOIN v_claim_payments p ON p.claim_id = base.claim_id';
BEGIN
  d := pg_get_viewdef('public.faelle_kunde_view'::regclass, true);
  IF position('p.kunde_ist' in d) = 0 THEN
    RAISE NOTICE 'faelle_kunde_view: bereits auf base repointed; skip'; RETURN;
  END IF;
  IF (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 THEN RAISE EXCEPTION 'a1 (kunde_betrag) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 THEN RAISE EXCEPTION 'a2 (kunde_am) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a3,'')))/length(a3) <> 1 THEN RAISE EXCEPTION 'a3 (join) count <> 1'; END IF;
  d := replace(d, a1, 'base.auszahlung_kunde_betrag AS auszahlung_kunde_betrag');
  d := replace(d, a2, 'base.auszahlung_kunde_eingegangen_am AS auszahlung_kunde_eingegangen_am');
  d := replace(d, a3, '');
  EXECUTE 'CREATE OR REPLACE VIEW public.faelle_kunde_view AS ' || d;
END $mig$;
