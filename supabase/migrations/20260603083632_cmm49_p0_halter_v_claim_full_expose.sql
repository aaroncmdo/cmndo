-- CMM-49 P0 (halter pilot): expose claims.halter_* via v_claim_full so claim-side
-- readers (admin/kb via '*', SV/kunde via whitelist) get the Halter data from claims.
-- Append-only (9 cols after vcp.sub_phase). No WITH clause -> preserves existing
-- reloptions (null/default). Definition reproduced verbatim from pg_get_viewdef.
CREATE OR REPLACE VIEW public.v_claim_full AS
 SELECT c.id,
    c.vehicle_id,
    c.schadentag,
    c.schadenzeit,
    c.entdeckt_am,
    c.schadenort_adresse,
    c.schadenort_plz,
    c.schadenort_ort,
    c.schadenort_land,
    c.schadenort_lat,
    c.schadenort_lng,
    c.schadenort_kategorie,
    c.hergang_kunde_text,
    c.hergang_sv_text,
    c.schadenart,
    c.fall_typ,
    c.unfall_konstellation,
    c.fahrerflucht,
    c.auslandskennzeichen,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.polizei_vor_ort,
    c.polizeibericht_status,
    c.geschaedigter_user_id,
    c.gegnerisches_vehicle_id,
    c.gegner_versicherung_id,
    c.gegner_versicherungsnummer,
    c.gegner_aktenzeichen,
    c.gegner_bekannt,
    c.anzahl_beteiligte_total,
    c.hat_personenschaden,
    c.hat_mietwagen,
    c.hat_nutzungsausfall,
    c.hat_sachschaden,
    c.hat_abschleppung,
    c.sachschaden_beschreibung,
    c.halter_ungleich_fahrer,
    c.kunden_konstellation,
    c.unfallskizze_url,
    c.unfallskizze_svg,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_generiert_am,
    c.status,
    c.abgeschlossen_am,
    c.verjaehrt_am,
    c.created_at,
    c.updated_at,
    c.created_by_user_id,
    c.created_via,
    c.claim_nummer,
    c.lead_id,
    c.kundenbetreuer_id,
    c.vs_ablehnungs_grund,
    c.regulierungs_betrag,
    c.endzustand_gesetzt_durch_user_id,
    c.endzustand_gesetzt_am,
    c.endzustand_grund,
    c.kanzlei_wunsch,
    c.kanzlei_wunsch_gefragt_am,
    c.kanzlei_wunsch_gefragt_in_phase,
    f.id AS fall_id,
    c.sv_id,
    c.service_typ,
    f.status AS fall_status,
    f.created_at AS fall_created_at,
    COALESCE(( SELECT cr.last_activity_at
           FROM claim_recency cr
          WHERE cr.claim_id = c.id), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag,
    c.szenario,
    c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_reminder_whatsapp_letzte_sendung,
    spd_termin.no_show_gemeldet_am,
    spd_termin.re_termin_token,
    c.sa_unterschrieben_am,
    c.vollmacht_signiert_am,
    kf.mandatsnummer,
    spd_termin.re_termin_token_eingelaufen_am,
    spd_termin.re_termin_eskalation_an_kb_am,
    cur_auftrag.storniert_am,
    kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,
    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,
    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,
    COALESCE(veh.bauart, f.fahrzeug_typ) AS fahrzeug_typ,
    c.sa_unterschrieben,
    kf.regulierung_am,
    c.regulierungs_betrag AS regulierung_betrag,
    g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag,
    g.fertiggestellt_am AS gutachten_eingegangen_am,
    c.sv_zugewiesen_am,
    c.schadens_ursache,
    c.schadenort_plz::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    c.fall_typ AS schadens_fall_typ,
    f.gegner_anzahl_beteiligte,
    f.gegner_fahrzeugtyp,
    f.organisation_id,
    f.dispatch_id,
    f.kunde_id,
    c.ist_aktiv,
    c.deaktiviert_grund,
    c.hat_vorschaeden,
    vv.anzahl AS vorschaden_anzahl,
    vv.letzter_datum AS vorschaden_letzter_datum,
    veh.cardentity_report -> 'typB'::text AS vorschaden_typ_b_bericht,
    veh.cardentity_letzter_pull AS cardentity_abfrage_am,
    spd_termin.besichtigungsort_adresse,
    spd_termin.besichtigungsort_lat,
    spd_termin.besichtigungsort_lng,
    spd_termin.besichtigungsort_notiz,
    spd_termin.besichtigungsort_place_id,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at) AS jsonb_agg
           FROM claim_parties cp
          WHERE cp.claim_id = c.id), '[]'::jsonb) AS parties,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) AS jsonb_agg
           FROM claim_vehicle_involvements cvi
          WHERE cvi.claim_id = c.id), '[]'::jsonb) AS vehicle_involvements,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) AS jsonb_agg
           FROM claim_payments cp2
          WHERE cp2.claim_id = c.id), '[]'::jsonb) AS payments,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) AS jsonb_agg
           FROM claim_mietwagen cm
          WHERE cm.claim_id = c.id), '[]'::jsonb) AS mietwagen,
    COALESCE(( SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) AS jsonb_agg
           FROM vs_korrespondenz vk
          WHERE vk.claim_id = c.id), '[]'::jsonb) AS vs_korrespondenz,
    COALESCE(( SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) AS jsonb_agg
           FROM repairs r
          WHERE r.claim_id = c.id), '[]'::jsonb) AS repairs,
    vcp.main_phase,
    vcp.sub_phase,
    c.halter_vorname,
    c.halter_nachname,
    c.halter_strasse,
    c.halter_plz,
    c.halter_stadt,
    c.halter_telefon,
    c.halter_email,
    c.halter_geburtsdatum,
    c.halter_name
   FROM claims c
     LEFT JOIN faelle f ON f.claim_id = c.id
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.storniert_am
           FROM auftraege a
          WHERE a.claim_id = c.id
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.besichtigungsort_lat,
            gt.besichtigungsort_lng,
            gt.besichtigungsort_notiz,
            gt.besichtigungsort_place_id,
            gt.no_show_gemeldet_am,
            gt.re_termin_token,
            gt.re_termin_token_eingelaufen_am,
            gt.re_termin_eskalation_an_kb_am
           FROM gutachter_termine gt
          WHERE gt.claim_id = c.id
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON true
     LEFT JOIN LATERAL ( SELECT NULLIF(count(*), 0)::integer AS anzahl,
            max(vv0.schaden_datum) AS letzter_datum
           FROM vehicle_vorschaeden vv0
          WHERE vv0.vehicle_id = c.vehicle_id) vv ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
