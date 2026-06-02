-- CMM-74 b-double-prime PREREQ: v_claim_phase +5 operative sub_phase.
-- Adds filmcheck / qc-pruefung / vs-kuerzt / anschlussschreiben / nachbesichtigung-laeuft
-- so the b-double-prime engine cursor can read its operative state from the derivative
-- instead of faelle.status. ADDITIVE: verified non-regressive over all 76 live claims
-- (per-claim checksum identical) + 5 synthetic rollback-tests green.
-- Precedence grounded in the old FALL_STATUS_TRANSITIONS lifecycle order.
-- Sources: filmcheck/qc -> auftraege.erstgutachten (gutachten_url, filmcheck_ok);
--   vs-kuerzt -> kanzlei_faelle.vs_reaktion_typ='gekuerzt';
--   anschlussschreiben -> kanzlei_faelle.anschlussschreiben_am (pre-lexdrive);
--   nachbesichtigung-laeuft -> active auftraege.typ='nachbesichtigung'.
-- Preserves reloptions=NULL (no security_invoker change).
CREATE OR REPLACE VIEW public.v_claim_phase AS
SELECT c.id AS claim_id,
  CASE
    WHEN c.status = ANY(ARRAY['reguliert_vollstaendig','storniert','klage_rechtsstreit','verjaehrt','abgelehnt_final','an_externe_kanzlei_uebergeben','termin_durchgefuehrt']) THEN 'abschluss'
    WHEN nb.active IS NOT NULL THEN 'regulierung'
    WHEN kf.vs_reaktion_typ = 'gekuerzt' THEN 'regulierung'
    WHEN kf.anschlussschreiben_am IS NOT NULL AND kf.lexdrive_case_id IS NULL THEN 'regulierung'
    WHEN kf.lexdrive_case_id IS NOT NULL THEN 'regulierung'
    WHEN c.status = ANY(ARRAY['in_kommunikation_vs','abgelehnt']) THEN 'regulierung'
    WHEN kf.claim_id IS NOT NULL THEN 'begutachtung'
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen' THEN 'begutachtung'
    ELSE 'erfassung'
  END AS main_phase,
  CASE
    WHEN c.status = 'reguliert_vollstaendig' THEN 'erfolgreich_reguliert'
    WHEN c.status = 'storniert' THEN 'storniert'
    WHEN c.status = 'klage_rechtsstreit' THEN 'klage_rechtsstreit'
    WHEN c.status = 'verjaehrt' THEN 'verjaehrt'
    WHEN c.status = 'abgelehnt_final' THEN 'abgelehnt_final'
    WHEN c.status = 'an_externe_kanzlei_uebergeben' THEN 'an_externe_kanzlei'
    WHEN c.status = 'termin_durchgefuehrt' THEN 'termin_durchgefuehrt'
    WHEN nb.active IS NOT NULL THEN 'nachbesichtigung-laeuft'
    WHEN kf.vs_reaktion_typ = 'gekuerzt' THEN 'vs-kuerzt'
    WHEN kf.anschlussschreiben_am IS NOT NULL AND kf.lexdrive_case_id IS NULL THEN 'anschlussschreiben'
    WHEN kf.lexdrive_case_id IS NOT NULL THEN CASE WHEN kf.status = 'auszahlung' THEN 'auszahlung' ELSE 'versicherungskontakt' END
    WHEN c.status = 'in_kommunikation_vs' THEN 'versicherungskontakt'
    WHEN c.status = 'abgelehnt' THEN 'nachforderung'
    WHEN kf.claim_id IS NOT NULL THEN 'kanzlei_uebergabe'
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen' THEN
      CASE WHEN eg.filmcheck_ok = true THEN 'qc-pruefung'
           WHEN eg.gutachten_url IS NOT NULL THEN 'filmcheck'
           ELSE eg.status END
    WHEN l.id IS NOT NULL THEN
      CASE WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'
           WHEN l.sa_unterschrieben THEN 'vollmacht_offen'
           ELSE 'sa_offen' END
    ELSE 'sa_offen'
  END AS sub_phase
FROM claims c
LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
LEFT JOIN leads l ON l.id = c.lead_id
LEFT JOIN LATERAL (
  SELECT a.status, a.gutachten_url, a.filmcheck_ok
  FROM auftraege a
  WHERE a.claim_id = c.id AND a.typ = 'erstgutachten'
  ORDER BY a.reihenfolge
  LIMIT 1
) eg ON true
LEFT JOIN LATERAL (
  SELECT 1 AS active
  FROM auftraege a
  WHERE a.claim_id = c.id AND a.typ = 'nachbesichtigung' AND a.status <> 'abgeschlossen'
  LIMIT 1
) nb ON true;
