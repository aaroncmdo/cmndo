-- CMM-44 MP-8b: v_claim_phase claims-zentrisch. Key = claims.id (SSoT), faelle-frei.
-- Ersetzt den faelle-zentrischen Stand (20260529150758): die Annahme claims.id = faelle.id
-- ist gebrochen (claims.id != faelle.id fuer 73/74; echter Link faelle.claim_id -> claims.id).
-- Sub-Entitaeten via claim-FK (kanzlei_faelle.claim_id, auftraege.claim_id); Erfassungs-Felder
-- via leads ueber claims.lead_id (claims-eigene Kopien ungesynct -> Ticket lead-claim-erfassung-
-- fieldsync). Inkludiert den fall-losen Claim (SSoT). Parity 74/74 zur Vorgaenger-View
-- verifiziert (0 Phasen-Shift); +1 fall-loser Claim landet in erfassung/sa_offen.
-- security_invoker restauriert (war via frueheres CREATE OR REPLACE verloren gegangen;
-- getClaimPhaseMap liest per Service-Client -> kein Effekt auf bestehenden Reader).
CREATE OR REPLACE VIEW public.v_claim_phase WITH (security_invoker = true) AS
 SELECT c.id AS claim_id,
        CASE
            WHEN c.status = ANY (ARRAY['reguliert_vollstaendig'::text, 'storniert'::text, 'klage_rechtsstreit'::text, 'verjaehrt'::text, 'abgelehnt_final'::text, 'an_externe_kanzlei_uebergeben'::text]) THEN 'abschluss'::text
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
