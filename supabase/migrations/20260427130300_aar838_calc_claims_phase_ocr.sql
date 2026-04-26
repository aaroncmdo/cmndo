-- AAR-838: calc_claims_phase erweitert um ocr_status-Logik.
--
-- Phase 3 (gutachter_unterwegs) bleibt aktiv solange:
--   - gutachten.status IN ('beauftragt','besichtigt','in_erstellung')  ODER
--   - gutachten.ocr_status IN ('pending','running','failed')           NEU
--
-- Heißt: PDF ist hochgeladen aber OCR ist gerade dran ODER OCR fehlgeschlagen
-- → Phase bleibt 3. Erst wenn OCR='done' UND status='final' → Phase 4.
--
-- Signatur unverändert — CREATE OR REPLACE behält Function-OID.

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

  -- Phase 6: VS-Kommunikation
  IF p_status = 'in_kommunikation_vs' OR EXISTS (
    SELECT 1 FROM public.vs_korrespondenz WHERE claim_id = p_claim_id
  ) THEN RETURN '6_kommunikation_versicherung'; END IF;

  -- Phase 5: In Reparatur
  IF EXISTS (
    SELECT 1 FROM public.repairs
     WHERE claim_id = p_claim_id AND status IN ('geplant','in_arbeit')
  ) THEN RETURN '5_in_reparatur'; END IF;

  -- Phase 4: Gutachten fertig — final UND OCR durch
  IF EXISTS (
    SELECT 1 FROM public.gutachten
     WHERE claim_id = p_claim_id
       AND status = 'final'
       AND (ocr_status IN ('done','manuell_uebersteuert') OR ocr_status IS NULL)
  ) THEN RETURN '4_gutachten_fertig'; END IF;

  -- Phase 3: Gutachter unterwegs — status aktiv ODER OCR läuft/wartet/fehlgeschlagen
  IF EXISTS (
    SELECT 1 FROM public.gutachten
     WHERE claim_id = p_claim_id
       AND (
         status IN ('beauftragt','besichtigt','in_erstellung')
         OR ocr_status IN ('pending','running','failed')
       )
  ) THEN RETURN '3_gutachter_unterwegs'; END IF;

  -- Phase 2: KB zugewiesen
  IF p_kb_id IS NOT NULL THEN RETURN '2_in_bearbeitung'; END IF;

  -- Phase 1: Neu
  IF p_status = 'dispatch_done' THEN RETURN '1_neu'; END IF;

  RETURN '0_lead';
END $$;

COMMENT ON FUNCTION public.calc_claims_phase IS
  'AAR-839 + AAR-838: Reduzierte Phasen-Logik. Phase 4 erfordert ocr_status=done '
  '(oder NULL für alte gutachten ohne OCR). Phase 3 hält stand solange OCR läuft '
  'oder fehlgeschlagen ist — KB sieht klare Visualisierung dass Gutachten technisch '
  'da ist aber noch nicht final konsumierbar.';
