-- SECURITY: 2 Claim-Views waren DEFINER + ohne Gate + an authenticated granted (von #3250 uebersehen)
-- -> jeder eingeloggte User las ALLE Claims (v_gutachten_werte: FIN/Kennzeichen/Finanzen; v_claim_timeline:
-- gesamte Ereignis-Historie). Empirisch verifiziert: random authenticated User sah 89 / 2096 fremde Zeilen.
-- Fix = der kanonische #3250-Gate claim_sichtbar_fuer_aktuellen_user(claim_id) (service_role-Bypass im Gate
-- -> admin-client-Consumer unberuehrt; legit User sehen weiter nur ihre Claims).
-- Verifiziert nach Apply: random->0/0, test-kunde->nur 1 eigener Claim, service_role-JWT->2108/89 (alle).

-- Leak 1: v_gutachten_werte (simpler Join) -> inline-Gate, OID-erhaltend.
CREATE OR REPLACE VIEW public.v_gutachten_werte AS
 SELECT c.id AS claim_id, c.lead_id, g.id AS gutachten_id, g.sv_id, g.status AS gutachten_status,
    g.gutachten_datum, g.gutachten_ocr_processed_at, g.gutachten_ocr_raw, g.gutachten_ocr_error,
    g.gutachten_ocr_manuell_ueberschrieben, g.gutachten_fin, g.gutachten_kennzeichen, g.gutachten_erstzulassung,
    g.gutachten_laufleistung_km, g.gutachten_tuv_bis, g.gutachten_fahrzeug_typ, g.gutachten_farbe,
    g.gutachten_farbcode, g.gutachten_kraftstoff, g.gutachten_vorschaeden_text, g.gutachten_lackmesswert_max_my,
    g.gutachten_karosseriezustand, g.gutachten_zeit_ak_std, g.gutachten_zeit_kar_std, g.gutachten_zeit_lack_std,
    g.gutachten_lohnsatz_ak_eur, g.gutachten_lohnsatz_kar_eur, g.gutachten_lohnsatz_lack_eur,
    g.gutachten_materialkosten_eur, g.gutachten_lackmaterial_eur, g.gutachten_verbringung_eur,
    g.gutachten_mietwagen_klasse, g.gutachten_mietwagen_tagessatz_eur, g.gutachten_nutzungsausfall_tagessatz_eur,
    g.gutachten_sv_honorar_netto, g.gutachten_sv_honorar_brutto, g.gutachten_kalkulationssystem,
    g.gutachten_seitenzahl, g.reparaturkosten_netto, g.reparaturkosten_brutto, g.minderwert, g.restwert,
    g.wiederbeschaffungswert, g.wiederbeschaffungsdauer_tage, g.nutzungsausfall_tage, g.totalschaden
   FROM claims c
     LEFT JOIN gutachten g ON g.claim_id = c.id
  WHERE claim_sichtbar_fuer_aktuellen_user(c.id);

-- Leak 2: v_claim_timeline (15-fach-UNION) -> rename-wrap (keine Dependents, kein riskantes Restate).
ALTER VIEW public.v_claim_timeline RENAME TO v_claim_timeline_ungated_internal;
REVOKE ALL ON public.v_claim_timeline_ungated_internal FROM authenticated;
COMMENT ON VIEW public.v_claim_timeline_ungated_internal IS
  'INTERN/ungated — NICHT an app-Rollen granten. Nur via gegateter View v_claim_timeline lesen (#claim-timeline-leak-fix).';
CREATE VIEW public.v_claim_timeline AS
  SELECT * FROM public.v_claim_timeline_ungated_internal
  WHERE claim_sichtbar_fuer_aktuellen_user(claim_id);
GRANT SELECT ON public.v_claim_timeline TO authenticated;
