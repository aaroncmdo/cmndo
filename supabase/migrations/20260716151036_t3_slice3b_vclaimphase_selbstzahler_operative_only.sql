-- T3-slice-3b: v_claim_phase Selbstzahler-Zweig von claims.status-Dual-Checks auf operative_status-only.
-- Behavior-preserving post-Konvergenz: status='reguliert_vollstaendig' <=> operative IN
-- ('reguliert_vollstaendig','abgeschlossen'); status='storniert' <=> operative='storniert'
-- (Konsistenz-Trigger + Backfill B2/B4). Einzige claims.status-Referenzen der View.
-- (Vollstaendige View-Definition — CREATE OR REPLACE, Spaltenset unveraendert; Basis = prod
--  pg_get_viewdef Stand 2026-07-16, nur die 3 Selbstzahler-CASE-Zeilen geaendert.)
CREATE OR REPLACE VIEW public.v_claim_phase AS
 SELECT fw.claim_id,
        CASE
            WHEN derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart) = 'selbstzahler'::text THEN
            CASE
                WHEN co.operative_status = ANY (ARRAY['abgeschlossen'::text, 'storniert'::text, 'reguliert_vollstaendig'::text]) THEN 'abschluss'::text
                WHEN (co.operative_status = ANY (ARRAY['ersterfassung'::text, 'onboarding'::text])) AND co.reparatur_werkstatt_id IS NULL AND rt.rt_status IS NULL THEN 'erfassung'::text
                ELSE 'reparatur'::text
            END
            ELSE COALESCE(co.phase_override,
            CASE
                WHEN fw.fw_sub = ANY (ARRAY['sa_offen'::text, 'vollmacht_offen'::text, 'onboarding_offen'::text]) THEN 'erfassung'::text
                WHEN fw.fw_sub = ANY (ARRAY['termin'::text, 'besichtigung'::text, 'gutachten'::text, 'filmcheck'::text, 'qc-pruefung'::text, 'kanzlei_uebergabe'::text]) THEN 'begutachtung'::text
                WHEN fw.fw_sub = ANY (ARRAY['anschlussschreiben'::text, 'versicherungskontakt'::text, 'vs-kuerzt'::text, 'nachbesichtigung-laeuft'::text, 'nachforderung'::text, 'auszahlung'::text]) THEN 'regulierung'::text
                ELSE 'abschluss'::text
            END)
        END AS main_phase,
        CASE
            WHEN derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart) = 'selbstzahler'::text THEN
            CASE
                WHEN co.operative_status = ANY (ARRAY['abgeschlossen'::text, 'reguliert_vollstaendig'::text]) THEN 'erfolgreich_reguliert'::text
                WHEN co.operative_status = 'storniert'::text THEN 'storniert'::text
                WHEN co.operative_status = 'reparatur-erledigt'::text OR rt.rt_status = 'erledigt'::text THEN 'reparatur-erledigt'::text
                WHEN co.operative_status = 'reparatur-laeuft'::text OR rt.rt_status = 'bestaetigt'::text THEN 'reparatur-laeuft'::text
                WHEN co.operative_status = 'reparatur-angefragt'::text OR rt.rt_status = 'angefragt'::text OR co.reparatur_werkstatt_id IS NOT NULL THEN 'reparatur-angefragt'::text
                WHEN co.operative_status = ANY (ARRAY['ersterfassung'::text, 'onboarding'::text]) THEN 'onboarding_offen'::text
                ELSE 'reparatur-werkstatt-suche'::text
            END
            ELSE fw.fw_sub
        END AS sub_phase
   FROM ( SELECT ord.claim_id,
                CASE
                    WHEN ord.o_sub IS NOT NULL AND ord.o_ord > ord.m_ord THEN ord.o_sub
                    ELSE ord.m_sub
                END AS fw_sub
           FROM ( SELECT base.claim_id,
                    base.m_sub,
                    base.o_sub,
                        CASE base.m_sub
                            WHEN 'sa_offen'::text THEN 0
                            WHEN 'vollmacht_offen'::text THEN 1
                            WHEN 'onboarding_offen'::text THEN 2
                            WHEN 'termin'::text THEN 3
                            WHEN 'besichtigung'::text THEN 4
                            WHEN 'gutachten'::text THEN 5
                            WHEN 'filmcheck'::text THEN 6
                            WHEN 'qc-pruefung'::text THEN 7
                            WHEN 'kanzlei_uebergabe'::text THEN 8
                            WHEN 'anschlussschreiben'::text THEN 9
                            WHEN 'versicherungskontakt'::text THEN 10
                            WHEN 'vs-kuerzt'::text THEN 11
                            WHEN 'nachbesichtigung-laeuft'::text THEN 12
                            WHEN 'nachforderung'::text THEN 13
                            WHEN 'auszahlung'::text THEN 14
                            ELSE 15
                        END AS m_ord,
                        CASE base.o_sub
                            WHEN 'sa_offen'::text THEN 0
                            WHEN 'vollmacht_offen'::text THEN 1
                            WHEN 'onboarding_offen'::text THEN 2
                            WHEN 'termin'::text THEN 3
                            WHEN 'besichtigung'::text THEN 4
                            WHEN 'gutachten'::text THEN 5
                            WHEN 'filmcheck'::text THEN 6
                            WHEN 'qc-pruefung'::text THEN 7
                            WHEN 'kanzlei_uebergabe'::text THEN 8
                            WHEN 'anschlussschreiben'::text THEN 9
                            WHEN 'versicherungskontakt'::text THEN 10
                            WHEN 'vs-kuerzt'::text THEN 11
                            WHEN 'nachbesichtigung-laeuft'::text THEN 12
                            WHEN 'nachforderung'::text THEN 13
                            WHEN 'auszahlung'::text THEN 14
                            ELSE 15
                        END AS o_ord
                   FROM ( SELECT c.id AS claim_id,
                                CASE
                                    WHEN nb.active IS NOT NULL THEN 'nachbesichtigung-laeuft'::text
                                    WHEN kf.status = 'auszahlung'::text OR kf.ausgezahlt_am IS NOT NULL THEN 'auszahlung'::text
                                    WHEN kf.vs_reaktion_typ = 'gekuerzt'::text THEN 'vs-kuerzt'::text
                                    WHEN kf.anschlussschreiben_am IS NOT NULL AND kf.lexdrive_case_id IS NULL THEN 'anschlussschreiben'::text
                                    WHEN kf.lexdrive_case_id IS NOT NULL OR kf.vs_kontakt_am IS NOT NULL THEN 'versicherungskontakt'::text
                                    WHEN kf.claim_id IS NOT NULL THEN 'kanzlei_uebergabe'::text
                                    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'::text THEN
                                    CASE
                                        WHEN eg.filmcheck_ok = true THEN 'qc-pruefung'::text
                                        WHEN eg.gutachten_url IS NOT NULL THEN 'filmcheck'::text
                                        ELSE eg.status
                                    END
                                    WHEN l.id IS NOT NULL THEN
                                    CASE
                                        WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'::text
                                        WHEN l.sa_unterschrieben THEN 'vollmacht_offen'::text
                                        ELSE 'sa_offen'::text
                                    END
                                    ELSE 'sa_offen'::text
                                END AS m_sub,
                                CASE
                                    WHEN c.operative_status = ANY (ARRAY['ersterfassung'::text, 'onboarding'::text, 'sv-gesucht'::text]) THEN
                                    CASE
                                        WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'::text
                                        WHEN l.sa_unterschrieben THEN 'vollmacht_offen'::text
                                        ELSE 'sa_offen'::text
                                    END
                                    WHEN c.operative_status = ANY (ARRAY['sv-zugewiesen'::text, 'sv-termin'::text]) THEN 'termin'::text
                                    WHEN c.operative_status = 'besichtigung'::text THEN 'besichtigung'::text
                                    WHEN c.operative_status = ANY (ARRAY['begutachtung-laeuft'::text, 'gutachten-eingegangen'::text]) THEN
                                    CASE
                                        WHEN eg.status IS NULL THEN 'gutachten'::text
                                        WHEN eg.filmcheck_ok = true THEN 'qc-pruefung'::text
                                        WHEN eg.gutachten_url IS NOT NULL THEN 'filmcheck'::text
                                        ELSE 'gutachten'::text
                                    END
                                    WHEN c.operative_status = 'filmcheck'::text THEN 'filmcheck'::text
                                    WHEN c.operative_status = 'qc-pruefung'::text THEN 'qc-pruefung'::text
                                    WHEN c.operative_status = 'kanzlei-uebergeben'::text THEN 'kanzlei_uebergabe'::text
                                    WHEN c.operative_status = 'anschlussschreiben'::text THEN 'anschlussschreiben'::text
                                    WHEN c.operative_status = ANY (ARRAY['regulierung'::text, 'regulierung-laeuft'::text, 'in_kommunikation_vs'::text]) THEN 'versicherungskontakt'::text
                                    WHEN c.operative_status = 'vs-kuerzt'::text THEN 'vs-kuerzt'::text
                                    WHEN c.operative_status = 'nachbesichtigung-laeuft'::text THEN 'nachbesichtigung-laeuft'::text
                                    WHEN c.operative_status = ANY (ARRAY['vs-abgelehnt'::text, 'klage'::text, 'abgelehnt'::text]) THEN 'nachforderung'::text
                                    WHEN c.operative_status = 'zahlung-eingegangen'::text THEN 'auszahlung'::text
                                    WHEN c.operative_status = 'abgeschlossen'::text THEN 'erfolgreich_reguliert'::text
                                    WHEN c.operative_status = 'storniert'::text THEN 'storniert'::text
                                    WHEN c.operative_status = 'reguliert_vollstaendig'::text THEN 'erfolgreich_reguliert'::text
                                    WHEN c.operative_status = 'klage_rechtsstreit'::text THEN 'klage_rechtsstreit'::text
                                    WHEN c.operative_status = 'verjaehrt'::text THEN 'verjaehrt'::text
                                    WHEN c.operative_status = 'abgelehnt_final'::text THEN 'abgelehnt_final'::text
                                    WHEN c.operative_status = 'an_externe_kanzlei_uebergeben'::text THEN 'an_externe_kanzlei'::text
                                    WHEN c.operative_status = 'termin_durchgefuehrt'::text THEN 'termin_durchgefuehrt'::text
                                    ELSE NULL::text
                                END AS o_sub
                           FROM claims c
                             LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
                             LEFT JOIN leads l ON l.id = c.lead_id
                             LEFT JOIN LATERAL ( SELECT a.status,
                                    a.gutachten_url,
                                    a.filmcheck_ok
                                   FROM auftraege a
                                  WHERE a.claim_id = c.id AND a.typ = 'erstgutachten'::text
                                  ORDER BY a.reihenfolge
                                 LIMIT 1) eg ON true
                             LEFT JOIN LATERAL ( SELECT 1 AS active
                                   FROM auftraege a
                                  WHERE a.claim_id = c.id AND a.typ = 'nachbesichtigung'::text AND a.status <> 'abgeschlossen'::text
                                 LIMIT 1) nb ON true) base) ord) fw
     LEFT JOIN claims co ON co.id = fw.claim_id
     LEFT JOIN LATERAL ( SELECT rt0.status AS rt_status
           FROM reparatur_termine rt0
          WHERE rt0.claim_id = fw.claim_id
          ORDER BY rt0.updated_at DESC NULLS LAST, rt0.created_at DESC
         LIMIT 1) rt ON true
     LEFT JOIN leads lo ON lo.id = co.lead_id
  WHERE claim_sichtbar_fuer_aktuellen_user(fw.claim_id);
