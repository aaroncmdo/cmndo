-- AAR-939 3c: Terminal-Status gutachten_abgeschlossen -> termin_durchgefuehrt.
-- Bei nur_gutachter/embed-B gibt es kein Platform-Gutachten; der Abschluss-Marker
-- ist der durchgefuehrte Termin. 0 claims-Rows tragen den alten Status (nichts
-- schreibt ihn bisher) -> sauberer Rename. Blast-Radius (live verifiziert):
-- nur claims_status_check + v_claim_phase referenzieren den Wert.

-- 1) CHECK-Constraint: alten Wert raus, neuen rein (Reihenfolge sonst identisch).
ALTER TABLE public.claims DROP CONSTRAINT claims_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_status_check CHECK (
  status = ANY (ARRAY[
    'dispatch_done'::text, 'in_bearbeitung'::text, 'in_kommunikation_vs'::text,
    'reguliert'::text, 'abgelehnt'::text, 'an_externe_kanzlei_uebergeben'::text,
    'storniert'::text, 'reguliert_vollstaendig'::text, 'klage_rechtsstreit'::text,
    'verjaehrt'::text, 'abgelehnt_final'::text, 'termin_durchgefuehrt'::text
  ])
);

-- 2) v_claim_phase: exakt die Live-Definition, nur die zwei
-- 'gutachten_abgeschlossen'-Vorkommen -> 'termin_durchgefuehrt' getauscht.
CREATE OR REPLACE VIEW public.v_claim_phase AS
 SELECT c.id AS claim_id,
        CASE
            WHEN c.status = ANY (ARRAY['reguliert_vollstaendig'::text, 'storniert'::text, 'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text, 'an_externe_kanzlei_uebergeben'::text, 'termin_durchgefuehrt'::text]) THEN 'abschluss'::text
            WHEN kf.lexdrive_case_id IS NOT NULL THEN 'regulierung'::text
            WHEN c.status = ANY (ARRAY['in_kommunikation_vs'::text, 'abgelehnt'::text]) THEN 'regulierung'::text
            WHEN kf.claim_id IS NOT NULL THEN 'begutachtung'::text
            WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'::text THEN 'begutachtung'::text
            ELSE 'erfassung'::text
        END AS main_phase,
        CASE
            WHEN c.status = 'reguliert_vollstaendig'::text THEN 'erfolgreich_reguliert'::text
            WHEN c.status = 'storniert'::text THEN 'storniert'::text
            WHEN c.status = 'klage_rechtsstreit'::text THEN 'klage_rechtsstreit'::text
            WHEN c.status = 'verjaehrt'::text THEN 'verjaehrt'::text
            WHEN c.status = 'abgelehnt_final'::text THEN 'abgelehnt_final'::text
            WHEN c.status = 'an_externe_kanzlei_uebergeben'::text THEN 'an_externe_kanzlei'::text
            WHEN c.status = 'termin_durchgefuehrt'::text THEN 'termin_durchgefuehrt'::text
            WHEN kf.lexdrive_case_id IS NOT NULL THEN
            CASE
                WHEN kf.status = 'auszahlung'::text THEN 'auszahlung'::text
                ELSE 'versicherungskontakt'::text
            END
            WHEN c.status = 'in_kommunikation_vs'::text THEN 'versicherungskontakt'::text
            WHEN c.status = 'abgelehnt'::text THEN 'nachforderung'::text
            WHEN kf.claim_id IS NOT NULL THEN 'kanzlei_uebergabe'::text
            WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'::text THEN eg.status
            WHEN l.id IS NOT NULL THEN
            CASE
                WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'::text
                WHEN l.sa_unterschrieben THEN 'vollmacht_offen'::text
                ELSE 'sa_offen'::text
            END
            ELSE 'sa_offen'::text
        END AS sub_phase
   FROM claims c
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN leads l ON l.id = c.lead_id
     LEFT JOIN LATERAL ( SELECT a.status
           FROM auftraege a
          WHERE a.claim_id = c.id AND a.typ = 'erstgutachten'::text
          ORDER BY a.reihenfolge
         LIMIT 1) eg ON true;
