-- Selbstzahler-aware kanonischer FlowLink (SPEC-selbstzahler-kanonischer-flowlink-phase-model).
-- v_claim_phase branched jetzt auf claims.abrechnungsweg: ein Selbstzahler-Claim (kein SV/Gutachten/
-- Kanzlei/VS — nur Werkstatt-Reparatur) bekommt den reduzierten Track erfassung -> reparatur ->
-- abschluss statt des Voll-Tracks (begutachtung/regulierung). Die reparatur-Sub-Phase kommt primaer
-- aus operative_status (Engine-Cursor: reparatur-werkstatt-suche/-angefragt/-laeuft/-erledigt,
-- Aaron-Wahl "Engine-Werte"), mit Fallback auf reparatur_termine.status + reparatur_werkstatt_id
-- (robust, bevor der Cursor gesetzt ist). Nicht-Selbstzahler: unveraendert (ELSE-Zweig byte-identisch).
-- Server-seitiger pg_get_viewdef+replace (4 Single-Line-Anchors), dry-run validiert (je 1x), reloptions=null.
-- Downstream (v_claim_base/v_claim_full/v_claim_workstate) erbt die reparatur-Phase automatisch
-- (Signatur claim_id/main_phase/sub_phase erhalten) -> 62dd5486-Ops-View braucht kein deriveRepairPhase.
DO $$
DECLARE d text; nd text;
BEGIN
  d := pg_get_viewdef('public.v_claim_phase'::regclass, true);
  IF (length(d)-length(replace(d,'COALESCE(co.phase_override,','')))/length('COALESCE(co.phase_override,') <> 1
     OR (length(d)-length(replace(d,'        END) AS main_phase,','')))/length('        END) AS main_phase,') <> 1
     OR (length(d)-length(replace(d,'fw.fw_sub AS sub_phase','')))/length('fw.fw_sub AS sub_phase') <> 1
     OR (length(d)-length(replace(d,'  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);','')))/length('  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);') <> 1 THEN
    RAISE EXCEPTION 'v_claim_phase selbstzahler-branch: Anchor-Count != 1 — Abbruch';
  END IF;

  nd := replace(
        replace(
        replace(
        replace(d,
        'COALESCE(co.phase_override,',
        'CASE WHEN co.abrechnungsweg = ''selbstzahler''::text THEN CASE WHEN co.status = ANY (ARRAY[''reguliert_vollstaendig''::text, ''storniert''::text]) OR co.operative_status = ANY (ARRAY[''abgeschlossen''::text, ''storniert''::text]) THEN ''abschluss''::text WHEN co.operative_status = ANY (ARRAY[''ersterfassung''::text, ''onboarding''::text]) AND co.reparatur_werkstatt_id IS NULL AND rt.rt_status IS NULL THEN ''erfassung''::text ELSE ''reparatur''::text END ELSE COALESCE(co.phase_override,'),
        '        END) AS main_phase,',
        '        END) END AS main_phase,'),
        'fw.fw_sub AS sub_phase',
        'CASE WHEN co.abrechnungsweg = ''selbstzahler''::text THEN CASE WHEN co.status = ''reguliert_vollstaendig''::text OR co.operative_status = ''abgeschlossen''::text THEN ''erfolgreich_reguliert''::text WHEN co.status = ''storniert''::text OR co.operative_status = ''storniert''::text THEN ''storniert''::text WHEN co.operative_status = ''reparatur-erledigt''::text OR rt.rt_status = ''erledigt''::text THEN ''reparatur-erledigt''::text WHEN co.operative_status = ''reparatur-laeuft''::text OR rt.rt_status = ''bestaetigt''::text THEN ''reparatur-laeuft''::text WHEN co.operative_status = ''reparatur-angefragt''::text OR rt.rt_status = ''angefragt''::text OR co.reparatur_werkstatt_id IS NOT NULL THEN ''reparatur-angefragt''::text WHEN co.operative_status = ANY (ARRAY[''ersterfassung''::text, ''onboarding''::text]) THEN ''onboarding_offen''::text ELSE ''reparatur-werkstatt-suche''::text END ELSE fw.fw_sub END AS sub_phase'),
        '  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);',
        '     LEFT JOIN LATERAL ( SELECT rt0.status AS rt_status FROM reparatur_termine rt0 WHERE rt0.claim_id = fw.claim_id ORDER BY rt0.updated_at DESC NULLS LAST, rt0.created_at DESC LIMIT 1) rt ON true
  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);');

  IF position('selbstzahler' in nd) = 0 OR position('rt.rt_status' in nd) = 0 THEN
    RAISE EXCEPTION 'v_claim_phase selbstzahler-branch: Transform unvollstaendig — Abbruch';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_phase AS ' || nd;
END $$;
