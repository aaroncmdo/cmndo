-- Unified Claim Stepper (Aaron "ein Stepper am Claim"): v_claim_phase leitet die Phase
-- jetzt als FURTHEST-SIGNAL-WINS ab = max(Milestone-Kaskade, operative_status) per globalem
-- SUB_ORDER. Bit-gleich zum TS-Spiegel src/lib/claims/lifecycle.ts (getClaimLifecycle).
-- Behebt 56 "Erfassung-Haenger" (operative=sv-termin/gutachten-eingegangen ohne Auftrag) OHNE
-- die 7 ersterfassung+kanzlei_fall-Claims zurueckzudruecken (Milestone gewinnt dort).
-- RLS-Klausel claim_sichtbar_fuer_aktuellen_user(claim_id) verbatim erhalten (reloptions=null,
-- kein security_invoker). Output-Taxonomie main_phase/sub_phase unveraendert.
CREATE OR REPLACE VIEW public.v_claim_phase AS
SELECT claim_id,
  CASE
    WHEN fw_sub IN ('sa_offen','vollmacht_offen','onboarding_offen') THEN 'erfassung'
    WHEN fw_sub IN ('termin','besichtigung','gutachten','filmcheck','qc-pruefung','kanzlei_uebergabe') THEN 'begutachtung'
    WHEN fw_sub IN ('anschlussschreiben','versicherungskontakt','vs-kuerzt','nachbesichtigung-laeuft','nachforderung','auszahlung') THEN 'regulierung'
    ELSE 'abschluss'
  END AS main_phase,
  fw_sub AS sub_phase
FROM (
  SELECT claim_id,
    CASE WHEN o_sub IS NOT NULL AND o_ord > m_ord THEN o_sub ELSE m_sub END AS fw_sub
  FROM (
    SELECT claim_id, m_sub, o_sub,
      (CASE m_sub WHEN 'sa_offen' THEN 0 WHEN 'vollmacht_offen' THEN 1 WHEN 'onboarding_offen' THEN 2 WHEN 'termin' THEN 3 WHEN 'besichtigung' THEN 4 WHEN 'gutachten' THEN 5 WHEN 'filmcheck' THEN 6 WHEN 'qc-pruefung' THEN 7 WHEN 'kanzlei_uebergabe' THEN 8 WHEN 'anschlussschreiben' THEN 9 WHEN 'versicherungskontakt' THEN 10 WHEN 'vs-kuerzt' THEN 11 WHEN 'nachbesichtigung-laeuft' THEN 12 WHEN 'nachforderung' THEN 13 WHEN 'auszahlung' THEN 14 ELSE 15 END) AS m_ord,
      (CASE o_sub WHEN 'sa_offen' THEN 0 WHEN 'vollmacht_offen' THEN 1 WHEN 'onboarding_offen' THEN 2 WHEN 'termin' THEN 3 WHEN 'besichtigung' THEN 4 WHEN 'gutachten' THEN 5 WHEN 'filmcheck' THEN 6 WHEN 'qc-pruefung' THEN 7 WHEN 'kanzlei_uebergabe' THEN 8 WHEN 'anschlussschreiben' THEN 9 WHEN 'versicherungskontakt' THEN 10 WHEN 'vs-kuerzt' THEN 11 WHEN 'nachbesichtigung-laeuft' THEN 12 WHEN 'nachforderung' THEN 13 WHEN 'auszahlung' THEN 14 ELSE 15 END) AS o_ord
    FROM (
      SELECT c.id AS claim_id,
        (CASE
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
          WHEN kf.lexdrive_case_id IS NOT NULL THEN (CASE WHEN kf.status = 'auszahlung' THEN 'auszahlung' ELSE 'versicherungskontakt' END)
          WHEN c.status = 'in_kommunikation_vs' THEN 'versicherungskontakt'
          WHEN c.status = 'abgelehnt' THEN 'nachforderung'
          WHEN kf.claim_id IS NOT NULL THEN 'kanzlei_uebergabe'
          WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen' THEN (CASE WHEN eg.filmcheck_ok = true THEN 'qc-pruefung' WHEN eg.gutachten_url IS NOT NULL THEN 'filmcheck' ELSE eg.status END)
          WHEN l.id IS NOT NULL THEN (CASE WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen' WHEN l.sa_unterschrieben THEN 'vollmacht_offen' ELSE 'sa_offen' END)
          ELSE 'sa_offen'
        END) AS m_sub,
        (CASE
          WHEN c.operative_status = ANY (ARRAY['ersterfassung','onboarding','sv-gesucht']) THEN (CASE WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen' WHEN l.sa_unterschrieben THEN 'vollmacht_offen' ELSE 'sa_offen' END)
          WHEN c.operative_status = ANY (ARRAY['sv-zugewiesen','sv-termin']) THEN 'termin'
          WHEN c.operative_status = 'besichtigung' THEN 'besichtigung'
          WHEN c.operative_status = ANY (ARRAY['begutachtung-laeuft','gutachten-eingegangen']) THEN (CASE WHEN eg.status IS NULL THEN 'gutachten' WHEN eg.filmcheck_ok = true THEN 'qc-pruefung' WHEN eg.gutachten_url IS NOT NULL THEN 'filmcheck' ELSE 'gutachten' END)
          WHEN c.operative_status = 'filmcheck' THEN 'filmcheck'
          WHEN c.operative_status = 'qc-pruefung' THEN 'qc-pruefung'
          WHEN c.operative_status = 'kanzlei-uebergeben' THEN 'kanzlei_uebergabe'
          WHEN c.operative_status = 'anschlussschreiben' THEN 'anschlussschreiben'
          WHEN c.operative_status = ANY (ARRAY['regulierung','regulierung-laeuft']) THEN 'versicherungskontakt'
          WHEN c.operative_status = 'vs-kuerzt' THEN 'vs-kuerzt'
          WHEN c.operative_status = 'nachbesichtigung-laeuft' THEN 'nachbesichtigung-laeuft'
          WHEN c.operative_status = ANY (ARRAY['vs-abgelehnt','klage']) THEN 'nachforderung'
          WHEN c.operative_status = 'zahlung-eingegangen' THEN 'auszahlung'
          WHEN c.operative_status = 'abgeschlossen' THEN 'erfolgreich_reguliert'
          WHEN c.operative_status = 'storniert' THEN 'storniert'
          ELSE NULL
        END) AS o_sub
      FROM claims c
        LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
        LEFT JOIN leads l ON l.id = c.lead_id
        LEFT JOIN LATERAL (SELECT a.status, a.gutachten_url, a.filmcheck_ok FROM auftraege a WHERE a.claim_id = c.id AND a.typ = 'erstgutachten' ORDER BY a.reihenfolge LIMIT 1) eg ON true
        LEFT JOIN LATERAL (SELECT 1 AS active FROM auftraege a WHERE a.claim_id = c.id AND a.typ = 'nachbesichtigung' AND a.status <> 'abgeschlossen' LIMIT 1) nb ON true
    ) base
  ) ord
) fw
WHERE claim_sichtbar_fuer_aktuellen_user(claim_id);
