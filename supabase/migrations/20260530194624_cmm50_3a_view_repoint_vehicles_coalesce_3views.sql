-- CMM-50.3a: vehicles-Repoint (COALESCE-Fallback auf faelle) fuer die 3 kleineren
-- Views. Jede neue Definition wurde per EXCEPT-Diff gegen die Live-View vorab als
-- byte-identisch verifiziert (vehicles leer -> COALESCE faellt auf f.* zurueck; 0/0).
-- Precision-Casts Pflicht: kennzeichen_aktuell::text, EXTRACT(YEAR FROM baujahr_monat)::integer.
-- reloptions bleiben null (kein security_invoker), Grants bleiben via CREATE OR REPLACE.
-- v_faelle_mit_aktuellem_termin (17k, 15 Spalten) + direkte Reader = 50.3b (separat, reviewed).

CREATE OR REPLACE VIEW public.faelle_kunde_view AS
 SELECT f.id, f.status,
    c.hergang_kunde_text AS schadens_beschreibung, c.schadentag AS schadens_datum,
    c.schadenort_adresse AS schadens_adresse, c.schadenort_plz::text AS schadens_plz, c.schadenort_ort AS schadens_ort,
    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,
    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,
    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,
    COALESCE((EXTRACT(year FROM veh.baujahr_monat))::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr,
    f.auszahlung_kunde_betrag, f.auszahlung_kunde_eingegangen_am, c.auszahlung_zahlungsweg,
    kf.eskalation_tag_14_ergebnis, kf.eskalation_tag_14_ergebnis_am, kf.eskalation_tag_21_ergebnis, kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_28_ergebnis, kf.eskalation_tag_28_ergebnis_am,
    spd_termin.nachbesichtigung_status, spd_termin.nachbesichtigung_termin_datum, spd_termin.nachbesichtigung_kunde_termin_vorschlaege,
    spd_termin.nachbesichtigung_kunde_termin_eingereicht_am, spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht,
    kf.vs_quote_prozent, kf.vs_quote_grund, kf.vs_quote_akzeptiert_am, kf.vs_quote_betrag_ausgezahlt, kf.vs_reaktion_typ, kf.vs_reaktion_am,
    spd_termin.besichtigungsort_adresse, c.abgeschlossen_am, f.kunde_id, f.sv_id, c.claim_nummer, vcp.main_phase, vcp.sub_phase
   FROM faelle f
     LEFT JOIN claims c ON c.id = f.claim_id
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse, gt.nachbesichtigung_status, gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_kunde_termin_vorschlaege, gt.nachbesichtigung_kunde_termin_eingereicht_am, gt.nachbesichtigung_sv_konfrontation_gewuenscht
           FROM gutachter_termine gt WHERE gt.claim_id = c.id ORDER BY gt.start_zeit DESC NULLS LAST LIMIT 1) spd_termin ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;

CREATE OR REPLACE VIEW public.faelle_sv_view AS
 SELECT f.id, f.status,
    c.hergang_kunde_text AS schadens_beschreibung, c.schadentag AS schadens_datum,
    c.schadenort_adresse AS schadens_adresse, c.schadenort_plz::text AS schadens_plz, c.schadenort_ort AS schadens_ort,
    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,
    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,
    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,
    COALESCE((EXTRACT(year FROM veh.baujahr_monat))::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr,
    g.gutachten_sv_honorar_netto AS gutachter_honorar, c.auszahlung_gutachter_eingegangen_am,
    kf.eskalation_tag_14_ergebnis, kf.eskalation_tag_14_ergebnis_am, kf.eskalation_tag_21_ergebnis, kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_28_ergebnis, kf.eskalation_tag_28_ergebnis_am,
    cur_auftrag.technische_stellungnahme_status, cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am, cur_auftrag.technische_stellungnahme_freigabe_am,
    kf.vs_kuerzung_grund, kf.vs_kuerzungs_typ, kf.kuerzungs_betrag,
    spd_termin.nachbesichtigung_status, spd_termin.nachbesichtigung_termin_datum, spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht,
    spd_termin.nachbesichtigung_sv_termin_vereinbart_am, kf.vs_reaktion_typ, kf.vs_reaktion_am,
    spd_termin.besichtigungsort_adresse, f.sv_id, f.kunde_id, c.claim_nummer, kf.mandatsnummer, kf.lexdrive_case_id, vcp.main_phase, vcp.sub_phase
   FROM faelle f
     LEFT JOIN claims c ON c.id = f.claim_id
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.technische_stellungnahme_status, a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am, a.technische_stellungnahme_freigabe_am
           FROM auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse, gt.nachbesichtigung_status, gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht, gt.nachbesichtigung_sv_termin_vereinbart_am
           FROM gutachter_termine gt WHERE gt.claim_id = c.id ORDER BY gt.start_zeit DESC NULLS LAST LIMIT 1) spd_termin ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;

CREATE OR REPLACE VIEW public.v_claim_full AS
 SELECT c.id, c.vehicle_id, c.schadentag, c.schadenzeit, c.entdeckt_am, c.schadenort_adresse, c.schadenort_plz, c.schadenort_ort,
    c.schadenort_land, c.schadenort_lat, c.schadenort_lng, c.schadenort_kategorie, c.hergang_kunde_text, c.hergang_sv_text,
    c.schadenart, c.fall_typ, c.unfall_konstellation, c.fahrerflucht, c.auslandskennzeichen, c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden, c.polizei_vor_ort, c.polizeibericht_status, c.geschaedigter_user_id, c.gegnerisches_vehicle_id,
    c.gegner_versicherung_id, c.gegner_versicherungsnummer, c.gegner_aktenzeichen, c.gegner_bekannt, c.anzahl_beteiligte_total,
    c.hat_personenschaden, c.hat_mietwagen, c.hat_nutzungsausfall, c.hat_sachschaden, c.hat_abschleppung, c.sachschaden_beschreibung,
    c.halter_ungleich_fahrer, c.kunden_konstellation, c.unfallskizze_url, c.unfallskizze_svg, c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund, c.unfallskizze_generiert_am, c.status, c.abgeschlossen_am, c.verjaehrt_am, c.created_at,
    c.updated_at, c.created_by_user_id, c.created_via, c.claim_nummer, c.lead_id, c.kundenbetreuer_id, c.vs_ablehnungs_grund,
    c.regulierungs_betrag, c.endzustand_gesetzt_durch_user_id, c.endzustand_gesetzt_am, c.endzustand_grund, c.kanzlei_wunsch,
    c.kanzlei_wunsch_gefragt_am, c.kanzlei_wunsch_gefragt_in_phase, f.id AS fall_id, f.sv_id, c.service_typ, f.status AS fall_status,
    f.created_at AS fall_created_at,
    COALESCE(( SELECT cr.last_activity_at FROM claim_recency cr WHERE cr.claim_id = c.id), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag, c.szenario, c.dokumente_vollstaendig_fuer_phase, c.dokumente_reminder_whatsapp_letzte_sendung,
    spd_termin.no_show_gemeldet_am, spd_termin.re_termin_token, c.sa_unterschrieben_am, c.vollmacht_signiert_am, kf.mandatsnummer,
    spd_termin.re_termin_token_eingelaufen_am, spd_termin.re_termin_eskalation_an_kb_am, cur_auftrag.storniert_am, kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,
    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,
    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,
    COALESCE(veh.bauart, f.fahrzeug_typ) AS fahrzeug_typ,
    c.sa_unterschrieben, kf.regulierung_am, c.regulierungs_betrag AS regulierung_betrag,
    g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag, g.fertiggestellt_am AS gutachten_eingegangen_am,
    c.sv_zugewiesen_am, c.schadens_ursache, c.schadenort_plz::text AS schadens_plz, c.schadenort_ort AS schadens_ort,
    c.fall_typ AS schadens_fall_typ, f.gegner_anzahl_beteiligte, f.gegner_fahrzeugtyp, f.organisation_id, f.dispatch_id, f.kunde_id,
    c.ist_aktiv, c.deaktiviert_grund, f.hat_vorschaeden, f.vorschaden_anzahl, f.vorschaden_letzter_datum, f.vorschaden_typ_b_bericht,
    f.cardentity_abfrage_am, spd_termin.besichtigungsort_adresse, spd_termin.besichtigungsort_lat, spd_termin.besichtigungsort_lng,
    spd_termin.besichtigungsort_notiz, spd_termin.besichtigungsort_place_id,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at) AS jsonb_agg FROM claim_parties cp WHERE cp.claim_id = c.id), '[]'::jsonb) AS parties,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) AS jsonb_agg FROM claim_vehicle_involvements cvi WHERE cvi.claim_id = c.id), '[]'::jsonb) AS vehicle_involvements,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) AS jsonb_agg FROM claim_payments cp2 WHERE cp2.claim_id = c.id), '[]'::jsonb) AS payments,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) AS jsonb_agg FROM claim_mietwagen cm WHERE cm.claim_id = c.id), '[]'::jsonb) AS mietwagen,
    COALESCE(( SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) AS jsonb_agg FROM vs_korrespondenz vk WHERE vk.claim_id = c.id), '[]'::jsonb) AS vs_korrespondenz,
    COALESCE(( SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) AS jsonb_agg FROM repairs r WHERE r.claim_id = c.id), '[]'::jsonb) AS repairs,
    vcp.main_phase, vcp.sub_phase
   FROM claims c
     LEFT JOIN faelle f ON f.claim_id = c.id
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.storniert_am FROM auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse, gt.besichtigungsort_lat, gt.besichtigungsort_lng, gt.besichtigungsort_notiz,
            gt.besichtigungsort_place_id, gt.no_show_gemeldet_am, gt.re_termin_token, gt.re_termin_token_eingelaufen_am, gt.re_termin_eskalation_an_kb_am
           FROM gutachter_termine gt WHERE gt.claim_id = c.id ORDER BY gt.start_zeit DESC NULLS LAST LIMIT 1) spd_termin ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
