-- Slice-4 (claims Money-Cache Normalisierung): v_claim_base referenziert 5 Cache-Spalten
-- (marketing_quelle/provision/provision_status + auszahlung_gutachter_betrag/_eingegangen_am)
-- nicht mehr aus claims. Der innere sub-SELECT liefert sie als NULL::<typ>; die aeusseren
-- Ausdruecke loesen sich damit auf den Ledger auf (COALESCE(p.sv_*, NULL) = p.sv_*) bzw. NULL.
-- Verhaltensneutral: prod hat 0 Daten in diesen 5 Spalten (regulierungs_betrag NICHT betroffen,
-- eigene Migration wegen v_claim_timeline-Abhaengigkeit). marketing_provision-Spalte bleibt bis
-- #4102-Deploy (fall-finanzen liest sie prod-seitig direkt), Projektion ist aber schon NULL.
-- Server-seitiger pg_get_viewdef+replace-Transform: kein Hand-Transkript des ~400-Zeilen-Views.
-- Reproduzierbar (die view-definierende Migration laeuft auf db-reset davor -> Anchor vorhanden);
-- fail-safe via Anchor-Guards (Abbruch statt stiller Drift). reloptions v_claim_base = null -> kein WITH().
DO $$
DECLARE
  d text;
  nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_base'::regclass, true);

  IF (length(d)-length(replace(d,'c.marketing_quelle,','')))/length('c.marketing_quelle,') <> 1
     OR (length(d)-length(replace(d,'c.marketing_provision,','')))/length('c.marketing_provision,') <> 1
     OR (length(d)-length(replace(d,'c.marketing_provision_status,','')))/length('c.marketing_provision_status,') <> 1
     OR (length(d)-length(replace(d,'c.auszahlung_gutachter_eingegangen_am,','')))/length('c.auszahlung_gutachter_eingegangen_am,') <> 1
     OR (length(d)-length(replace(d,'c.auszahlung_gutachter_betrag,','')))/length('c.auszahlung_gutachter_betrag,') <> 1
  THEN
    RAISE EXCEPTION 'v_claim_base Slice-4 Rewrite: Anchor-Count != 1 — Abbruch (View-Struktur unerwartet)';
  END IF;

  nd := replace(replace(replace(replace(replace(d,
     'c.marketing_quelle,', 'NULL::text AS marketing_quelle,'),
     'c.marketing_provision,', 'NULL::numeric AS marketing_provision,'),
     'c.marketing_provision_status,', 'NULL::text AS marketing_provision_status,'),
     'c.auszahlung_gutachter_eingegangen_am,', 'NULL::timestamp with time zone AS auszahlung_gutachter_eingegangen_am,'),
     'c.auszahlung_gutachter_betrag,', 'NULL::numeric AS auszahlung_gutachter_betrag,');

  IF position('c.marketing_quelle,' in nd) <> 0
     OR position('c.marketing_provision,' in nd) <> 0
     OR position('c.marketing_provision_status,' in nd) <> 0
     OR position('c.auszahlung_gutachter_eingegangen_am,' in nd) <> 0
     OR position('c.auszahlung_gutachter_betrag,' in nd) <> 0
  THEN
    RAISE EXCEPTION 'v_claim_base Slice-4 Rewrite: c.<col>-Referenz nach replace uebrig — Abbruch';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || nd;
END $$;
