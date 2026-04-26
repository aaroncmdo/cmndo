-- AAR-839 Step 5/8: calc_claims_phase neu
--
-- Reduziert die Phasen-Logik: Phase 7 (vs_eskalation) und Phase 8 (auszahlung)
-- entfallen, Phase 6 wird zur breiten Klammer "kommunikation_versicherung".
-- Endzustände sind manuell (durch markClaimAs*-Actions in AAR-840).
--
-- Reihenfolge der Auflösung:
--   1. Manuelle Endzustände (höchste Priorität)
--   2. Phase 6: vs_korrespondenz existiert ODER status='in_kommunikation_vs'
--   3. Phase 5: repairs status IN ('geplant','in_arbeit')
--   4. Phase 4: gutachten status='final'
--   5. Phase 3: gutachten status IN ('beauftragt','besichtigt','in_erstellung')
--   6. Phase 2: KB zugewiesen
--   7. Phase 1: dispatch_done
--   8. Default: 0_lead
--
-- Signatur (p_claim_id UUID, p_status TEXT, p_kb_id UUID) RETURNS TEXT bleibt
-- unverändert — CREATE OR REPLACE behält die Function-OID, alle Trigger
-- bleiben verlinkt.

CREATE OR REPLACE FUNCTION public.calc_claims_phase(
  p_claim_id UUID,
  p_status   TEXT,
  p_kb_id    UUID
) RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Manuelle Endzustände haben höchste Priorität
  IF p_status = 'storniert'                     THEN RETURN '9_storniert'; END IF;
  IF p_status = 'reguliert'                     THEN RETURN '9_reguliert'; END IF;
  IF p_status = 'abgelehnt'                     THEN RETURN '9_abgelehnt'; END IF;
  IF p_status = 'an_externe_kanzlei_uebergeben' THEN RETURN '9_an_externe_kanzlei'; END IF;

  -- Phase 6: VS-Kommunikation (collapse Phase 6+7+8)
  -- Trigger: vs_korrespondenz existiert ODER status='in_kommunikation_vs'
  IF p_status = 'in_kommunikation_vs' OR EXISTS (
    SELECT 1 FROM public.vs_korrespondenz WHERE claim_id = p_claim_id
  ) THEN RETURN '6_kommunikation_versicherung'; END IF;

  -- Phase 5: In Reparatur (Status auf 'geplant' korrigiert — matched repairs-CHECK)
  IF EXISTS (
    SELECT 1 FROM public.repairs
     WHERE claim_id = p_claim_id AND status IN ('geplant','in_arbeit')
  ) THEN RETURN '5_in_reparatur'; END IF;

  -- Phase 4: Gutachten fertig
  IF EXISTS (
    SELECT 1 FROM public.gutachten
     WHERE claim_id = p_claim_id AND status = 'final'
  ) THEN RETURN '4_gutachten_fertig'; END IF;

  -- Phase 3: Gutachter unterwegs
  IF EXISTS (
    SELECT 1 FROM public.gutachten
     WHERE claim_id = p_claim_id AND status IN ('beauftragt','besichtigt','in_erstellung')
  ) THEN RETURN '3_gutachter_unterwegs'; END IF;

  -- Phase 2: KB zugewiesen
  IF p_kb_id IS NOT NULL THEN RETURN '2_in_bearbeitung'; END IF;

  -- Phase 1: Neu (dispatch_done, kein KB)
  IF p_status = 'dispatch_done' THEN RETURN '1_neu'; END IF;

  -- Default: claim hat status den wir nicht kennen → 0_lead
  RETURN '0_lead';
END $$;

COMMENT ON FUNCTION public.calc_claims_phase IS
  'AAR-839: Reduzierte Phasen-Logik (Phase 7+8 raus, manuelle Endzustände rein). '
  'Phase 6 = breite VS-Kommunikations-Klammer (jede vs_korrespondenz-Row ODER manueller Trigger). '
  'claim_payments hat KEINE Phase-Wirkung mehr — nur Buchhaltung.';
