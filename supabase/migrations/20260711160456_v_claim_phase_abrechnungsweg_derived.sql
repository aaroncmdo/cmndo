-- #2 pure-derived: v_claim_phase branched jetzt auf die ABGELEITETE abrechnungsweg (derive_abrechnungsweg)
-- statt der gespeicherten claims.abrechnungsweg-Spalte (write-once-Cache, 63% NULL). Damit ist der
-- Selbstzahler-Branch zuverlaessig: ein Claim mit lead.schuldfrage=eigenverantwortung + eigene_versicherung=nein
-- bekommt den reparatur-Track, auch wenn claims.abrechnungsweg NULL ist. Outer leads-Join (lo) fuer die
-- Determinanten. Server-seitiger replace, guarded.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_phase'::regclass, true);
  IF (length(d)-length(replace(d,'co.abrechnungsweg = ''selbstzahler''::text','')))/length('co.abrechnungsweg = ''selbstzahler''::text') <> 2
     OR (length(d)-length(replace(d,'  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);','')))/length('  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);') <> 1 THEN
    RAISE EXCEPTION 'v_claim_phase derived: Anchor-Count unerwartet — Abbruch';
  END IF;
  nd := replace(
        replace(d,
        '  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);',
        '     LEFT JOIN leads lo ON lo.id = co.lead_id
  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);'),
        'co.abrechnungsweg = ''selbstzahler''::text',
        'derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart) = ''selbstzahler''::text');
  IF position('co.abrechnungsweg' in nd) <> 0 OR position('derive_abrechnungsweg(co.service_typ' in nd) = 0 OR position('lo.id = co.lead_id' in nd) = 0 THEN
    RAISE EXCEPTION 'v_claim_phase derived: Transform unvollstaendig — Abbruch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_phase AS ' || nd;
END $$;
