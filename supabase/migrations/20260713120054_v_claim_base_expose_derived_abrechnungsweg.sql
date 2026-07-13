-- #2 pure-derived Layer B: v_claim_base exponiert derived abrechnungsweg (kanonische Quelle fuer Code-
-- Consumer). Outer leads-Join (lb) + Projektion via derive_abrechnungsweg — additive Spalte am Ende
-- (CREATE OR REPLACE erlaubt Append). v_claim_full/Code lesen dann fall.abrechnungsweg (derived) statt der
-- stale claims.abrechnungsweg-Spalte. Nicht role-gated (Klassifikation, kein PII/Geld — analog
-- v_werkstatt_auftrag/v_claim_workstate). reloptions=null, alle Gates byte-erhalten, dry-run validiert.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_base'::regclass, true);
  IF (length(d)-length(replace(d,'LEFT JOIN v_claim_payments p ON p.claim_id = sub.id','')))/length('LEFT JOIN v_claim_payments p ON p.claim_id = sub.id') <> 1
     OR (length(d)-length(replace(d,'p.kunde_am AS auszahlung_kunde_eingegangen_am','')))/length('p.kunde_am AS auszahlung_kunde_eingegangen_am') <> 1 THEN
    RAISE EXCEPTION 'v_claim_base expose: Anchor-Count != 1 — Abbruch';
  END IF;
  nd := replace(replace(d,
    'LEFT JOIN v_claim_payments p ON p.claim_id = sub.id',
    'LEFT JOIN v_claim_payments p ON p.claim_id = sub.id
     LEFT JOIN leads lb ON lb.id = sub.lead_id'),
    'p.kunde_am AS auszahlung_kunde_eingegangen_am',
    'p.kunde_am AS auszahlung_kunde_eingegangen_am,
    derive_abrechnungsweg(sub.service_typ, lb.schuldfrage, lb.eigene_versicherung, sub.schadenart) AS abrechnungsweg');
  IF position('LEFT JOIN leads lb ON lb.id = sub.lead_id' in nd) = 0 OR position(' AS abrechnungsweg
   FROM ' in nd) = 0 THEN
    RAISE EXCEPTION 'v_claim_base expose: Transform unvollstaendig — Abbruch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || nd;
END $$;
