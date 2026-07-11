-- Slice-4 regulierungs_betrag Retire (Teil 1/2): v_claim_base + v_claim_timeline_ungated_internal
-- referenzieren claims.regulierungs_betrag nicht mehr.
-- v_claim_base: innerer sub liefert BEIDE Projektionen als NULL::numeric(10,2) (roh + alias);
--   der aeussere COALESCE(p.vs_ist, p.vs_soll, sub.regulierung_betrag) loest sich damit auf's
--   Ledger auf (regulierung_betrag bleibt ledger-first, verhaltensneutral: 1 Cache-Row=Ledger-match).
--   Die rohe regulierungs_betrag-Projektion (v_claim_full re-exposed, aber 0 Code-Reader) -> NULL.
-- v_claim_timeline: endzustand-Payload c.regulierungs_betrag -> (claim,'vs')-Ledger-forderungsbetrag
--   (Subquery). prod endzustand_rows=0 -> 0 Datenimpact; security_invoker=false erhalten.
-- Server-seitiger pg_get_viewdef+replace mit Anchor-Guards; dry-run validiert.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_base'::regclass, true);
  IF (length(d)-length(replace(d,'c.regulierungs_betrag,','')))/length('c.regulierungs_betrag,') <> 1
     OR (length(d)-length(replace(d,'c.regulierungs_betrag AS regulierung_betrag,','')))/length('c.regulierungs_betrag AS regulierung_betrag,') <> 1 THEN
    RAISE EXCEPTION 'v_claim_base regulierungs_betrag: Anchor-Count != 1';
  END IF;
  nd := replace(replace(d,
     'c.regulierungs_betrag,', 'NULL::numeric(10,2) AS regulierungs_betrag,'),
     'c.regulierungs_betrag AS regulierung_betrag,', 'NULL::numeric(10,2) AS regulierung_betrag,');
  IF position('c.regulierungs_betrag' in nd) <> 0 THEN
    RAISE EXCEPTION 'v_claim_base regulierungs_betrag: Ref nach replace uebrig';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || nd;
END $$;

DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_timeline_ungated_internal'::regclass, true);
  IF (length(d)-length(replace(d,'c.regulierungs_betrag','')))/length('c.regulierungs_betrag') <> 1 THEN
    RAISE EXCEPTION 'v_claim_timeline regulierungs_betrag: Anchor-Count != 1';
  END IF;
  nd := replace(d, 'c.regulierungs_betrag',
     '(SELECT cp.forderungsbetrag FROM claim_payments cp WHERE cp.claim_id = c.id AND cp.partei = ''vs'' ORDER BY cp.updated_at DESC LIMIT 1)');
  IF position('c.regulierungs_betrag' in nd) <> 0 THEN
    RAISE EXCEPTION 'v_claim_timeline regulierungs_betrag: Ref nach replace uebrig';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_timeline_ungated_internal WITH (security_invoker = false) AS ' || nd;
END $$;
