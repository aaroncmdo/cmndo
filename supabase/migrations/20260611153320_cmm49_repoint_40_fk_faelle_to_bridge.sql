-- CMM-49 (fb34de27, Step 2 der faelle-FK-Anker-Sequenz): die 40 Child-FK von faelle(id)
-- auf faelle_claim_bridge(fall_id) umankern — VOR dem Converter-Cutover (Entity-Lane).
-- Value-neutral, KEIN Daten-Remap:
--   * faelle_claim_bridge_pkey = PRIMARY KEY (fall_id) -> valider FK-Target.
--   * Bridge enthaelt jede fall_id (faelle_not_in_bridge=0); Orphan-Check ueber alle 40
--     Child-Spalten = 0 unmittelbar vor Apply -> jedes ADD validiert ohne Datenaenderung.
--   * on_delete pro FK erhalten (confdeltype a/c/n -> NO ACTION/CASCADE/SET NULL);
--     on_update + deferrable waren ueberall default.
-- Loesch-Semantik bleibt: faelle-DELETE -> trg_sync_faelle_claim_bridge loescht die Bridge-Row
-- -> Cascade/Block/SetNull feuert von der Bridge (gleiche Wirkung, ein Hop spaeter).
-- Bereits via apply_migration appliziert (recorded version 20260611153320); File = Regel-2-Tracking.
-- Nach diesem Schritt: 0 FK -> faelle, 40 FK -> faelle_claim_bridge (verifiziert).

ALTER TABLE public.abrechnung_positionen DROP CONSTRAINT abrechnung_positionen_fall_id_fkey;
ALTER TABLE public.abrechnung_positionen ADD CONSTRAINT abrechnung_positionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.admin_termine DROP CONSTRAINT admin_termine_fall_id_fkey;
ALTER TABLE public.admin_termine ADD CONSTRAINT admin_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.auftraege DROP CONSTRAINT auftraege_fall_id_fkey;
ALTER TABLE public.auftraege ADD CONSTRAINT auftraege_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.email_log DROP CONSTRAINT email_log_fall_id_fkey;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.fall_dokumente DROP CONSTRAINT fall_dokumente_fall_id_fkey;
ALTER TABLE public.fall_dokumente ADD CONSTRAINT fall_dokumente_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.fall_read_state DROP CONSTRAINT fall_read_state_fall_id_fkey;
ALTER TABLE public.fall_read_state ADD CONSTRAINT fall_read_state_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.flow_links DROP CONSTRAINT flow_links_fall_id_fkey;
ALTER TABLE public.flow_links ADD CONSTRAINT flow_links_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.forderungspositionen DROP CONSTRAINT forderungspositionen_fall_id_fkey;
ALTER TABLE public.forderungspositionen ADD CONSTRAINT forderungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.gutachter_abrechnungen DROP CONSTRAINT gutachter_abrechnungen_fall_id_fkey;
ALTER TABLE public.gutachter_abrechnungen ADD CONSTRAINT gutachter_abrechnungen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.gutachter_abrechnungspositionen DROP CONSTRAINT gutachter_abrechnungspositionen_fall_id_fkey;
ALTER TABLE public.gutachter_abrechnungspositionen ADD CONSTRAINT gutachter_abrechnungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.gutachter_finder_anfragen DROP CONSTRAINT gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey;
ALTER TABLE public.gutachter_finder_anfragen ADD CONSTRAINT gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey FOREIGN KEY (konvertiert_zu_fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.gutachter_mitteilungen DROP CONSTRAINT gutachter_mitteilungen_fall_id_fkey;
ALTER TABLE public.gutachter_mitteilungen ADD CONSTRAINT gutachter_mitteilungen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.gutachter_termine DROP CONSTRAINT gutachter_termine_fall_id_fkey;
ALTER TABLE public.gutachter_termine ADD CONSTRAINT gutachter_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.gutschriften DROP CONSTRAINT gutschriften_referenz_fall_id_fkey;
ALTER TABLE public.gutschriften ADD CONSTRAINT gutschriften_referenz_fall_id_fkey FOREIGN KEY (referenz_fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.kanzlei_abrechnung_positionen DROP CONSTRAINT kanzlei_abrechnung_positionen_fall_id_fkey;
ALTER TABLE public.kanzlei_abrechnung_positionen ADD CONSTRAINT kanzlei_abrechnung_positionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.kanzlei_admin_termine DROP CONSTRAINT kanzlei_admin_termine_fall_id_fkey;
ALTER TABLE public.kanzlei_admin_termine ADD CONSTRAINT kanzlei_admin_termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.kanzlei_faelle DROP CONSTRAINT kanzlei_faelle_fall_id_fkey;
ALTER TABLE public.kanzlei_faelle ADD CONSTRAINT kanzlei_faelle_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.kunde_gutachten_requests DROP CONSTRAINT kunde_gutachten_requests_fall_id_fkey;
ALTER TABLE public.kunde_gutachten_requests ADD CONSTRAINT kunde_gutachten_requests_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.leads DROP CONSTRAINT leads_konvertiert_zu_fall_id_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_konvertiert_zu_fall_id_fkey FOREIGN KEY (konvertiert_zu_fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.makler_fall_consent DROP CONSTRAINT makler_fall_consent_fall_id_fkey;
ALTER TABLE public.makler_fall_consent ADD CONSTRAINT makler_fall_consent_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.makler_provisionen DROP CONSTRAINT makler_provisionen_fall_id_fkey;
ALTER TABLE public.makler_provisionen ADD CONSTRAINT makler_provisionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.nachrichten DROP CONSTRAINT nachrichten_fall_id_fkey;
ALTER TABLE public.nachrichten ADD CONSTRAINT nachrichten_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.notification_events DROP CONSTRAINT notification_events_fall_id_fkey;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.parteien DROP CONSTRAINT parteien_fall_id_fkey;
ALTER TABLE public.parteien ADD CONSTRAINT parteien_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.personenschaden_personen DROP CONSTRAINT personenschaden_personen_fall_id_fkey;
ALTER TABLE public.personenschaden_personen ADD CONSTRAINT personenschaden_personen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.pflichtdokumente DROP CONSTRAINT pflichtdokumente_fall_id_fkey;
ALTER TABLE public.pflichtdokumente ADD CONSTRAINT pflichtdokumente_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.phase_transitions DROP CONSTRAINT phase_transitions_fall_id_fkey;
ALTER TABLE public.phase_transitions ADD CONSTRAINT phase_transitions_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.qc_checkliste DROP CONSTRAINT qc_checkliste_fall_id_fkey;
ALTER TABLE public.qc_checkliste ADD CONSTRAINT qc_checkliste_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.regulierungs_klassifizierung DROP CONSTRAINT regulierungs_klassifizierung_fall_id_fkey;
ALTER TABLE public.regulierungs_klassifizierung ADD CONSTRAINT regulierungs_klassifizierung_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.reklamationen DROP CONSTRAINT reklamationen_fall_id_fkey;
ALTER TABLE public.reklamationen ADD CONSTRAINT reklamationen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.schadenspositionen DROP CONSTRAINT schadenspositionen_fall_id_fkey;
ALTER TABLE public.schadenspositionen ADD CONSTRAINT schadenspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.sla_tracking DROP CONSTRAINT sla_tracking_fall_id_fkey;
ALTER TABLE public.sla_tracking ADD CONSTRAINT sla_tracking_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.sv_live_location DROP CONSTRAINT sv_live_location_fall_id_fkey;
ALTER TABLE public.sv_live_location ADD CONSTRAINT sv_live_location_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT tasks_fall_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.termine DROP CONSTRAINT termine_fall_id_fkey;
ALTER TABLE public.termine ADD CONSTRAINT termine_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.timeline DROP CONSTRAINT timeline_fall_id_fkey;
ALTER TABLE public.timeline ADD CONSTRAINT timeline_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.webhook_events DROP CONSTRAINT webhook_events_fall_id_fkey;
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_inbound_messages DROP CONSTRAINT whatsapp_inbound_messages_matched_fall_id_fkey;
ALTER TABLE public.whatsapp_inbound_messages ADD CONSTRAINT whatsapp_inbound_messages_matched_fall_id_fkey FOREIGN KEY (matched_fall_id) REFERENCES public.faelle_claim_bridge(fall_id);

ALTER TABLE public.zahlungseingaenge DROP CONSTRAINT zahlungseingaenge_fall_id_fkey;
ALTER TABLE public.zahlungseingaenge ADD CONSTRAINT zahlungseingaenge_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;

ALTER TABLE public.zahlungspositionen DROP CONSTRAINT zahlungspositionen_fall_id_fkey;
ALTER TABLE public.zahlungspositionen ADD CONSTRAINT zahlungspositionen_fall_id_fkey FOREIGN KEY (fall_id) REFERENCES public.faelle_claim_bridge(fall_id) ON DELETE CASCADE;
