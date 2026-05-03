-- AAR-854 Migration 2/4: Mapping-Function claims.phase → faelle.aktuelle_phase
--
-- Übersetzt Welle-7 (11 Phasen) auf Welle-6 (52 Sub-Phasen) deterministisch.
-- Bei Mehrdeutigkeit wird zusätzlicher Sub-Asset-Status hinzugezogen.

CREATE OR REPLACE FUNCTION public.map_claim_phase_to_faelle_phase(
  p_claim_phase  TEXT,
  p_claim_status TEXT,
  p_claim_id     UUID
) RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gutachten_status     TEXT;
  v_gutachten_ocr_status TEXT;
  v_repair_status        TEXT;
  v_vs_korr_count        INT;
  v_vs_ablehnungs_grund  TEXT;
BEGIN
  -- Endzustände — direktes Mapping
  IF p_claim_phase = '9_storniert'           THEN RETURN 'fall_akzeptiert_storniert'; END IF;
  IF p_claim_phase = '9_an_externe_kanzlei'  THEN RETURN 'kanzlei_fallakte_angelegt'; END IF;
  IF p_claim_phase = '9_reguliert'           THEN RETURN 'vollzahlung_eingegangen'; END IF;

  IF p_claim_phase = '9_abgelehnt' THEN
    SELECT vs_ablehnungs_grund INTO v_vs_ablehnungs_grund
      FROM public.claims WHERE id = p_claim_id;
    IF v_vs_ablehnungs_grund = 'verjaehrung' THEN RETURN 'klage_eingereicht'; END IF;
    RETURN 'ablehnung_kanzlei_prueft';
  END IF;

  IF p_claim_phase = '6_kommunikation_versicherung' THEN
    SELECT COUNT(*) INTO v_vs_korr_count
      FROM public.vs_korrespondenz WHERE claim_id = p_claim_id;
    IF v_vs_korr_count = 0 THEN RETURN 'warten_auf_vs'; END IF;
    RETURN 'vs_kontakt_laeuft';
  END IF;

  IF p_claim_phase = '5_in_reparatur' THEN
    SELECT status INTO v_repair_status
      FROM public.repairs WHERE claim_id = p_claim_id
     ORDER BY created_at DESC LIMIT 1;
    IF v_repair_status = 'abgeschlossen' THEN RETURN 'warten_auf_vs'; END IF;
    RETURN COALESCE(
      (SELECT aktuelle_phase FROM public.faelle WHERE claim_id = p_claim_id),
      'qc_bestanden'
    );
  END IF;

  IF p_claim_phase = '4_gutachten_fertig' THEN
    SELECT status, ocr_status INTO v_gutachten_status, v_gutachten_ocr_status
      FROM public.gutachten WHERE claim_id = p_claim_id
     ORDER BY created_at DESC LIMIT 1;
    IF v_gutachten_ocr_status IN ('pending','running') THEN RETURN 'gutachten_wird_erstellt'; END IF;
    IF v_gutachten_status = 'final' THEN RETURN 'qc_bestanden'; END IF;
    RETURN 'gutachten_erstellt';
  END IF;

  IF p_claim_phase = '3_gutachter_unterwegs' THEN
    SELECT status INTO v_gutachten_status
      FROM public.gutachten WHERE claim_id = p_claim_id
     ORDER BY created_at DESC LIMIT 1;
    IF v_gutachten_status = 'besichtigt'     THEN RETURN 'sv_vor_ort'; END IF;
    IF v_gutachten_status = 'in_erstellung'  THEN RETURN 'begutachtung_abgeschlossen'; END IF;
    RETURN 'sv_unterwegs';
  END IF;

  IF p_claim_phase = '2_in_bearbeitung' THEN RETURN 'termin_bestaetigt'; END IF;
  IF p_claim_phase = '1_neu'            THEN RETURN 'fallakte_angelegt'; END IF;
  IF p_claim_phase = '0_lead'           THEN RETURN 'fallakte_wird_angelegt'; END IF;

  -- Fallback: behalte aktuellen faelle-Stand
  RETURN (SELECT aktuelle_phase FROM public.faelle WHERE claim_id = p_claim_id);
END $$;

COMMENT ON FUNCTION public.map_claim_phase_to_faelle_phase IS
  'AAR-854: Welle-7 → Welle-6-Phase-Mapping. Genutzt von trg_sync_claims_to_faelle.';
