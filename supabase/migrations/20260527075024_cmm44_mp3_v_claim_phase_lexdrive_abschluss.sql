-- CMM-44 MP-3: v_claim_phase — neue Ableitung (Read-Side).
--
-- Aenderungen ggü. P0 (20260526202512_v_claim_phase_view.sql):
--   * regulierung-Eintritt: kanzlei_faelle.lexdrive_case_id IS NOT NULL (B-10) —
--     statt bloßer kanzlei_faelle-Existenz. Interim (kf da, aber lexdrive null) =
--     begutachtung-Tail 'kanzlei_uebergabe' ("Kanzlei-Uebergabe laeuft").
--   * abschluss: claims.status-terminal (B-11/B-12) — statt payment-/auszahlung-
--     basiert. Substates erfolgreich_reguliert / storniert / klage_rechtsstreit /
--     verjaehrt. Auszahlung (kf.status='auszahlung') bleibt regulierung-INTERN
--     (B-12), kippt NICHT selbst in abschluss.
--
-- Das terminale claims.status-Vokabular wird KB/Kanzlei-seitig gesetzt (Writer =
-- MP-7/MP-8). Bis dahin ist abschluss leer (claims.status heute = dispatch_done/
-- in_bearbeitung). lexdrive_case_id ist heute durchgehend null (LexDrive-Feed =
-- Zukunft) → die 12 Kanzlei-Faelle stehen in 'kanzlei_uebergabe' (begutachtung-Tail),
-- regulierung beginnt sobald lexdrive_case_id gesetzt wird.
--
-- MUSS bitgleich zu getClaimLifecycle (src/lib/claims/lifecycle.ts) sein —
-- Parity-Gate: scripts/probe-claim-phase-parity.mjs (0 Divergenzen).
-- Prioritaet: abschluss > regulierung > Kanzlei-Uebergabe-Interim > begutachtung > erfassung.
-- claim_id == faelle.id == claims.id (1:1). security_invoker=on -> RLS des Lesers.

CREATE OR REPLACE VIEW public.v_claim_phase
WITH (security_invoker = on) AS
SELECT
  f.id AS claim_id,
  CASE
    -- abschluss: terminaler claims.status (B-11/B-12, KB/Kanzlei-gesetzt)
    WHEN c.status IN ('reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit', 'verjaehrt')
      THEN 'abschluss'
    -- regulierung: LexDrive-Kanzlei hat uebernommen (B-10)
    WHEN kf.lexdrive_case_id IS NOT NULL
      THEN 'regulierung'
    -- Kanzlei-Uebergabe-Interim: kf existiert, aber noch kein lexdrive_case_id
    -- → begutachtung-Tail "Kanzlei-Uebergabe laeuft" (B-10)
    WHEN kf.fall_id IS NOT NULL
      THEN 'begutachtung'
    -- begutachtung: aktiver Erstgutachten-Auftrag
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'
      THEN 'begutachtung'
    -- erfassung: nur Lead (oder Fallback)
    ELSE 'erfassung'
  END AS main_phase,
  CASE
    WHEN c.status = 'reguliert_vollstaendig' THEN 'erfolgreich_reguliert'
    WHEN c.status = 'storniert' THEN 'storniert'
    WHEN c.status = 'klage_rechtsstreit' THEN 'klage_rechtsstreit'
    WHEN c.status = 'verjaehrt' THEN 'verjaehrt'
    WHEN kf.lexdrive_case_id IS NOT NULL
      THEN CASE WHEN kf.status = 'auszahlung' THEN 'auszahlung' ELSE 'versicherungskontakt' END
    WHEN kf.fall_id IS NOT NULL
      THEN 'kanzlei_uebergabe'
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'
      THEN eg.status   -- termin|besichtigung|gutachten == ClaimSubPhase 1:1
    WHEN l.id IS NOT NULL
      THEN CASE
             WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'
             WHEN l.sa_unterschrieben THEN 'vollmacht_offen'
             ELSE 'sa_offen'
           END
    ELSE 'sa_offen'
  END AS sub_phase
FROM public.faelle f
LEFT JOIN public.claims c ON c.id = f.id
LEFT JOIN public.kanzlei_faelle kf ON kf.fall_id = f.id
LEFT JOIN public.leads l ON l.id = f.lead_id
LEFT JOIN LATERAL (
  SELECT a.status
  FROM public.auftraege a
  WHERE a.fall_id = f.id AND a.typ = 'erstgutachten'
  ORDER BY a.reihenfolge ASC
  LIMIT 1
) eg ON true;
