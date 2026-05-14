-- Performance — Indexes für 107 unindexed Foreign Keys.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (LOW §4.3)
--
-- 113 FK-Constraints im public-Schema hatten keinen passenden Index auf
-- der FK-Spalte → Advisor-Lint unindexed_foreign_keys. Diese Indexes
-- sind kritisch für:
--   • JOIN-Performance (FK-Lookups laufen sonst als Sequential-Scan)
--   • ON DELETE CASCADE / ON UPDATE CASCADE (Parent-Modifikation
--     muss alle Child-Rows scannen)
--   • RLS-Subquery-Pattern (z.B. `fall_id IN (SELECT id FROM faelle WHERE ...)`)
--
-- Migration deckt 107 single-column-FKs ab (6 sind multi-column und
-- separate Strategie). IF NOT EXISTS macht das idempotent — falls
-- jemand zwischenzeitlich einen Index manuell anlegt, no-op.
--
-- Naming: idx_<table>_<column> (Supabase-Convention).
--
-- Verify post-apply:
--   select count(*) from pg_constraint c
--   where c.contype='f' and c.connamespace='public'::regnamespace
--     and array_length(c.conkey,1)=1
--     and not exists (select 1 from pg_index i where i.indrelid=c.conrelid
--                       and (c.conkey[1]::int) = any(i.indkey));
--   → 0

CREATE INDEX IF NOT EXISTS idx_abrechnung_positionen_abrechnung_id ON abrechnung_positionen (abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_abrechnung_positionen_fall_id ON abrechnung_positionen (fall_id);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_initiated_by_profile_id ON aircall_calls (initiated_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_aircall_relay_seats_belegt_call_id ON aircall_relay_seats (belegt_call_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_invitations_invited_by_party_id ON airdrop_invitations (invited_by_party_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_invitations_resulting_party_id ON airdrop_invitations (resulting_party_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_invitations_withdrawn_by_user_id ON airdrop_invitations (withdrawn_by_user_id);
CREATE INDEX IF NOT EXISTS idx_anruf_log_erstellt_von ON anruf_log (erstellt_von);
CREATE INDEX IF NOT EXISTS idx_auftraege_vorheriger_auftrag_id ON auftraege (vorheriger_auftrag_id);
CREATE INDEX IF NOT EXISTS idx_claim_mietwagen_created_by_user_id ON claim_mietwagen (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_claim_parties_created_by_user_id ON claim_parties (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_claim_parties_versicherung_id ON claim_parties (versicherung_id);
CREATE INDEX IF NOT EXISTS idx_claim_payments_claim_id ON claim_payments (claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_payments_created_by_user_id ON claim_payments (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_by_user_id ON claims (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_endzustand_gesetzt_durch_user_id ON claims (endzustand_gesetzt_durch_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_gegnerisches_vehicle_id ON claims (gegnerisches_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_claims_geschaedigter_party_id ON claims (geschaedigter_party_id);
CREATE INDEX IF NOT EXISTS idx_claims_verursacher_party_id ON claims (verursacher_party_id);
CREATE INDEX IF NOT EXISTS idx_communities_erstellt_von ON communities (erstellt_von);
CREATE INDEX IF NOT EXISTS idx_dokument_upload_anfragen_erstellt_von ON dokument_upload_anfragen (erstellt_von);
CREATE INDEX IF NOT EXISTS idx_dsgvo_loeschauftraege_bestaetigt_von_user_id ON dsgvo_loeschauftraege (bestaetigt_von_user_id);
CREATE INDEX IF NOT EXISTS idx_faelle_dispatch_id ON faelle (dispatch_id);
CREATE INDEX IF NOT EXISTS idx_faelle_eskalation_tag_14_ergebnis_von ON faelle (eskalation_tag_14_ergebnis_von);
CREATE INDEX IF NOT EXISTS idx_faelle_eskalation_tag_21_ergebnis_von ON faelle (eskalation_tag_21_ergebnis_von);
CREATE INDEX IF NOT EXISTS idx_faelle_eskalation_tag_28_ergebnis_von ON faelle (eskalation_tag_28_ergebnis_von);
CREATE INDEX IF NOT EXISTS idx_faelle_kanzlei_abrechnung_id ON faelle (kanzlei_abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_faelle_konvertiert_von_lead ON faelle (konvertiert_von_lead);
CREATE INDEX IF NOT EXISTS idx_faelle_lead_id ON faelle (lead_id);
CREATE INDEX IF NOT EXISTS idx_fall_dokumente_position_id ON fall_dokumente (position_id);
CREATE INDEX IF NOT EXISTS idx_fall_summaries_generated_by_user_id ON fall_summaries (generated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_flow_links_fall_id ON flow_links (fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_created_by_user_id ON gutachten (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_laeufer_report_id ON gutachten (laeufer_report_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_ocr_run_id ON gutachten (ocr_run_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_pdf_uploaded_by_user_id ON gutachten (pdf_uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_fotos_uploaded_by ON gutachten_fotos (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_gutachter_abrechnungen_fall_id ON gutachter_abrechnungen (fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_abrechnungen_sv_id ON gutachter_abrechnungen (sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_abrechnungspositionen_abrechnung_id ON gutachter_abrechnungspositionen (abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_abrechnungspositionen_fall_id ON gutachter_abrechnungspositionen (fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_einzahlungen_sv_id ON gutachter_einzahlungen (sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_konvertiert_zu_fall_id ON gutachter_finder_anfragen (konvertiert_zu_fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_konvertiert_zu_lead_id ON gutachter_finder_anfragen (konvertiert_zu_lead_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_konvertiert_zu_user_id ON gutachter_finder_anfragen (konvertiert_zu_user_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_zugeordneter_sv_id ON gutachter_finder_anfragen (zugeordneter_sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_zugeordneter_sv_lead_id ON gutachter_finder_anfragen (zugeordneter_sv_lead_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_mitteilungen_fall_id ON gutachter_mitteilungen (fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_mitteilungen_sv_id ON gutachter_mitteilungen (sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_monatsabrechnungen_sv_id ON gutachter_monatsabrechnungen (sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_termine_fall_id ON gutachter_termine (fall_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_waitlist_bearbeitet_von_user_id ON gutachter_waitlist (bearbeitet_von_user_id);
CREATE INDEX IF NOT EXISTS idx_gutachter_waitlist_konvertiert_zu_sv_id ON gutachter_waitlist (konvertiert_zu_sv_id);
CREATE INDEX IF NOT EXISTS idx_gutschriften_referenz_abrechnung_id ON gutschriften (referenz_abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_gutschriften_referenz_fall_id ON gutschriften (referenz_fall_id);
CREATE INDEX IF NOT EXISTS idx_individuelle_anfragen_sv_id ON individuelle_anfragen (sv_id);
CREATE INDEX IF NOT EXISTS idx_kanzlei_abrechnung_positionen_fall_id ON kanzlei_abrechnung_positionen (fall_id);
CREATE INDEX IF NOT EXISTS idx_kanzlei_pakete_versendet_durch_user_id ON kanzlei_pakete (versendet_durch_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_konvertiert_durch_user_id ON leads (konvertiert_durch_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_konvertiert_zu_fall_id ON leads (konvertiert_zu_fall_id);
CREATE INDEX IF NOT EXISTS idx_makler_aktiviert_von ON makler (aktiviert_von);
CREATE INDEX IF NOT EXISTS idx_makler_fall_consent_widerrufen_von ON makler_fall_consent (widerrufen_von);
CREATE INDEX IF NOT EXISTS idx_makler_provisionen_abrechnung_id ON makler_provisionen (abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_makler_provisionen_fall_id ON makler_provisionen (fall_id);
CREATE INDEX IF NOT EXISTS idx_makler_provisionen_lead_id ON makler_provisionen (lead_id);
CREATE INDEX IF NOT EXISTS idx_makler_provisionen_promotion_code_id ON makler_provisionen (promotion_code_id);
CREATE INDEX IF NOT EXISTS idx_mitteilungen_absender_id ON mitteilungen (absender_id);
CREATE INDEX IF NOT EXISTS idx_nachrichten_kb_empfaenger_id ON nachrichten (kb_empfaenger_id);
CREATE INDEX IF NOT EXISTS idx_nachrichten_sender_id ON nachrichten (sender_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_triggered_by_user_id ON notification_events (triggered_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_runs_triggered_by_user_id ON ocr_runs (triggered_by_user_id);
CREATE INDEX IF NOT EXISTS idx_organisationen_parent_user_id ON organisationen (parent_user_id);
CREATE INDEX IF NOT EXISTS idx_organisationen_vertrag_unterzeichnet_id ON organisationen (vertrag_unterzeichnet_id);
CREATE INDEX IF NOT EXISTS idx_paket_upgrades_sv_id ON paket_upgrades (sv_id);
CREATE INDEX IF NOT EXISTS idx_pflichtdokumente_angefordert_von_user_id ON pflichtdokumente (angefordert_von_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_entstanden_aus_airdrop_id ON profiles (entstanden_aus_airdrop_id);
CREATE INDEX IF NOT EXISTS idx_profiles_entstanden_aus_claim_id ON profiles (entstanden_aus_claim_id);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_makler_id ON promotion_codes (makler_id);
CREATE INDEX IF NOT EXISTS idx_qc_checkliste_geprueft_von ON qc_checkliste (geprueft_von);
CREATE INDEX IF NOT EXISTS idx_regulierungs_klassifizierung_erfasst_von ON regulierungs_klassifizierung (erfasst_von);
CREATE INDEX IF NOT EXISTS idx_reklamationen_sv_id ON reklamationen (sv_id);
CREATE INDEX IF NOT EXISTS idx_repairs_created_by_user_id ON repairs (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_repairs_gutachten_id ON repairs (gutachten_id);
CREATE INDEX IF NOT EXISTS idx_sachverstaendige_gesperrt_von_user_id ON sachverstaendige (gesperrt_von_user_id);
CREATE INDEX IF NOT EXISTS idx_sachverstaendige_profile_id ON sachverstaendige (profile_id);
CREATE INDEX IF NOT EXISTS idx_sachverstaendige_sa_vorlage_geprueft_von_user_id ON sachverstaendige (sa_vorlage_geprueft_von_user_id);
CREATE INDEX IF NOT EXISTS idx_sachverstaendige_verifiziert_von ON sachverstaendige (verifiziert_von);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_eskalation_task_id ON sla_tracking (eskalation_task_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_sv_id ON stripe_events (sv_id);
CREATE INDEX IF NOT EXISTS idx_sv_kalender_verbindungen_fehler_task_id ON sv_kalender_verbindungen (fehler_task_id);
CREATE INDEX IF NOT EXISTS idx_sv_live_location_fall_id ON sv_live_location (fall_id);
CREATE INDEX IF NOT EXISTS idx_sv_onboarding_rechnungen_rechnungs_konfiguration_id ON sv_onboarding_rechnungen (rechnungs_konfiguration_id);
CREATE INDEX IF NOT EXISTS idx_sv_organisation_inhaber_sv_id ON sv_organisation (inhaber_sv_id);
CREATE INDEX IF NOT EXISTS idx_sv_organisation_laeufer_reports_organisation_id ON sv_organisation_laeufer_reports (organisation_id);
CREATE INDEX IF NOT EXISTS idx_sv_tages_session_aktueller_termin_id ON sv_tages_session (aktueller_termin_id);
CREATE INDEX IF NOT EXISTS idx_tasks_erstellt_von_id ON tasks (erstellt_von_id);
CREATE INDEX IF NOT EXISTS idx_tasks_gate_task_id ON tasks (gate_task_id);
CREATE INDEX IF NOT EXISTS idx_technische_probleme_fall_id ON technische_probleme (fall_id);
CREATE INDEX IF NOT EXISTS idx_termine_fall_id ON termine (fall_id);
CREATE INDEX IF NOT EXISTS idx_timeline_erstellt_von ON timeline (erstellt_von);
CREATE INDEX IF NOT EXISTS idx_vehicles_zb1_dokument_id ON vehicles (zb1_dokument_id);
CREATE INDEX IF NOT EXISTS idx_vertraege_unterzeichnet_vorlage_id ON vertraege_unterzeichnet (vorlage_id);
CREATE INDEX IF NOT EXISTS idx_vs_korrespondenz_created_by_user_id ON vs_korrespondenz (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user_id ON webhook_events (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_messages_matched_lead_id ON whatsapp_inbound_messages (matched_lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_messages_matched_termin_id ON whatsapp_inbound_messages (matched_termin_id);
CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_fall_id ON zahlungseingaenge (fall_id);
CREATE INDEX IF NOT EXISTS idx_zahlungspositionen_fall_id ON zahlungspositionen (fall_id);
CREATE INDEX IF NOT EXISTS idx_zahlungspositionen_zahlung_id ON zahlungspositionen (zahlung_id);
