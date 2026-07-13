-- #7 (F3, Aaron 11.07.): das rolle_sieht_gutachtenwerte()-Gate auf den Gutachten-Werten in v_claim_base
-- entfernen — inkonsistente/veraltete Policy. v_gutachten_werte (die kanonische Entity) hat KEIN Role-Gate
-- (nur claim_sichtbar), Makler lesen die Werte bereits live (#4116). gutachter_honorar + nutzungsausfall_gesamt
-- waren im Base schon ungegatet — die 3 (reparaturkosten/wertminderung/nutzungsausfall) sind der inkonsistente
-- Rest → ungaten. Andere Gates (regulierung/margen/bankdaten) BLEIBEN unveraendert (dry-run + post-verifiziert).
-- Kein Werkstatt-Leak: v_claim_full/v_werkstatt_auftrag exponieren die Gutachten-Werte gar nicht; nur
-- v_claim_base + v_faelle (interne + makler=F3-erlaubt). DO+replace = verifiziert replay-safe (Anchors im
-- tracked chain: extend_v_claim_base_for_vfmat/create). Re-Sourcing aus v_gutachten_werte (DRY-Normalisierung,
-- Marker-Item 1) = separater Follow-up mit Shape-Diff-Harness.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_base'::regclass, true);
  IF (length(d)-length(replace(d,'rolle_sieht_gutachtenwerte','')))/length('rolle_sieht_gutachtenwerte') <> 3 THEN
    RAISE EXCEPTION 'v_claim_base F3: erwartet 3 gutachtenwerte-Gates, gefunden abweichend — Abbruch';
  END IF;
  nd := replace(replace(replace(d,
    E'        CASE\n            WHEN rolle_sieht_gutachtenwerte() THEN sub.reparaturkosten\n            ELSE NULL::numeric\n        END::numeric(10,2) AS reparaturkosten',
    'sub.reparaturkosten::numeric(10,2) AS reparaturkosten'),
    E'        CASE\n            WHEN rolle_sieht_gutachtenwerte() THEN sub.wertminderung\n            ELSE NULL::numeric\n        END::numeric(10,2) AS wertminderung',
    'sub.wertminderung::numeric(10,2) AS wertminderung'),
    E'        CASE\n            WHEN rolle_sieht_gutachtenwerte() THEN sub.nutzungsausfall\n            ELSE NULL::boolean\n        END AS nutzungsausfall,',
    'sub.nutzungsausfall AS nutzungsausfall,');
  IF position('rolle_sieht_gutachtenwerte' in nd) <> 0 THEN
    RAISE EXCEPTION 'v_claim_base F3: gutachtenwerte-Gate nach replace uebrig — Abbruch';
  END IF;
  IF position('rolle_sieht_regulierung' in nd) = 0 OR position('rolle_sieht_bankdaten' in nd) = 0 THEN
    RAISE EXCEPTION 'v_claim_base F3: anderes Gate versehentlich entfernt — Abbruch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || nd;
END $$;
