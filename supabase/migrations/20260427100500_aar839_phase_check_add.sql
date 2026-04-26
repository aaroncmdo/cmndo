-- AAR-839 Step 7/8: claims.phase CHECK-Constraint anlegen
--
-- Pre-Flight (2026-04-27): claims.phase hat heute KEINEN CHECK — die Spalte
-- ist free-form TEXT mit Default '1_neu'. Heißt: nur ADD CONSTRAINT, kein
-- DROP.
--
-- Reihenfolge: Diese Migration läuft VOR dem phase-Backfill (Step 8) — der
-- aktuelle prod-Wert '1_neu' aller 4 Rows ist im neuen Set, der CHECK
-- aktiviert sich ohne Violation.

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_phase_check;

ALTER TABLE public.claims ADD CONSTRAINT claims_phase_check CHECK (
  phase = ANY (ARRAY[
    '0_lead'::text,
    '1_neu'::text,
    '2_in_bearbeitung'::text,
    '3_gutachter_unterwegs'::text,
    '4_gutachten_fertig'::text,
    '5_in_reparatur'::text,
    '6_kommunikation_versicherung'::text,
    '9_reguliert'::text,
    '9_abgelehnt'::text,
    '9_an_externe_kanzlei'::text,
    '9_storniert'::text
  ])
);

COMMENT ON CONSTRAINT claims_phase_check ON public.claims IS
  'AAR-839: 11 erlaubte Phase-Werte. Phasen 0-6 werden auto durch '
  'calc_claims_phase() gesetzt, Phase 9_* manuell durch markClaimAs*-Actions.';
