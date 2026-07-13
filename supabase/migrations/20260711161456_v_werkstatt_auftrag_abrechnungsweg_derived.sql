-- #2 pure-derived: v_werkstatt_auftrag.abrechnungsweg jetzt abgeleitet (derive_abrechnungsweg) statt der
-- gespeicherten claims.abrechnungsweg-Spalte. Reitet nicht auf v_claim_base -> inline-Ableitung aus
-- c.service_typ + l.schuldfrage + l.eigene_versicherung + c.schadenart (leads l + claims c schon gejoint).
-- Signatur-erhaltend (Output-Spalte 'abrechnungsweg' bleibt). view-konsistenz TEIL 2 (kunde_name) ist
-- auf dieser View pending -> rebased auf diese Def (rein additiv, kein Konflikt).
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_werkstatt_auftrag'::regclass, true);
  IF (length(d)-length(replace(d,'c.abrechnungsweg,','')))/length('c.abrechnungsweg,') <> 1 THEN
    RAISE EXCEPTION 'v_werkstatt_auftrag derived: Anchor-Count != 1 — Abbruch';
  END IF;
  nd := replace(d, 'c.abrechnungsweg,',
    'derive_abrechnungsweg(c.service_typ, l.schuldfrage, l.eigene_versicherung, c.schadenart) AS abrechnungsweg,');
  IF position('c.abrechnungsweg,' in nd) <> 0 OR position('derive_abrechnungsweg(c.service_typ' in nd) = 0 THEN
    RAISE EXCEPTION 'v_werkstatt_auftrag derived: Transform unvollstaendig — Abbruch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS ' || nd;
END $$;
