-- Contract-Drift-Fix: faelle_sv_view exponierte nach dem CMM-50-3a-Repoint
-- (20260530194624) zwei Spalten nicht mehr, die der SV-Fall-Detail-Consumer
-- (src/app/gutachter/fall/[id]/page.tsx) weiterhin selektiert:
--   - auszahlung_gutachter_betrag (liegt auf claims c, exponiert war nur ..._eingegangen_am)
--   - nachbesichtigung_kunde_termin_vorschlaege (liegt auf gutachter_termine -> spd_termin-Lateral)
-- Folge: "column faelle_sv_view.auszahlung_gutachter_betrag does not exist".
-- Rein ADDITIV: bestehende 40 Spalten + Reihenfolge unveraendert (CREATE OR REPLACE
-- erlaubt nur Append am Ende), 2 Spalten ans Ende, 1 Spalte ins spd_termin-Lateral.
CREATE OR REPLACE VIEW public.faelle_sv_view AS
 SELECT f.id,
    f.status,
    c.hergang_kunde_text AS schadens_beschreibung,
    c.schadentag AS schadens_datum,
    c.schadenort_adresse AS schadens_adresse,
    c.schadenort_plz::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen,
    COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller,
    COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell,
    COALESCE(EXTRACT(year FROM veh.baujahr_monat)::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr,
    g.gutachten_sv_honorar_netto AS gutachter_honorar,
    c.auszahlung_gutachter_eingegangen_am,
    kf.eskalation_tag_14_ergebnis,
    kf.eskalation_tag_14_ergebnis_am,
    kf.eskalation_tag_21_ergebnis,
    kf.eskalation_tag_21_ergebnis_am,
    kf.eskalation_tag_28_ergebnis,
    kf.eskalation_tag_28_ergebnis_am,
    cur_auftrag.technische_stellungnahme_status,
    cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am,
    cur_auftrag.technische_stellungnahme_freigabe_am,
    kf.vs_kuerzung_grund,
    kf.vs_kuerzungs_typ,
    kf.kuerzungs_betrag,
    spd_termin.nachbesichtigung_status,
    spd_termin.nachbesichtigung_termin_datum,
    spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht,
    spd_termin.nachbesichtigung_sv_termin_vereinbart_am,
    kf.vs_reaktion_typ,
    kf.vs_reaktion_am,
    spd_termin.besichtigungsort_adresse,
    f.sv_id,
    f.kunde_id,
    c.claim_nummer,
    kf.mandatsnummer,
    kf.lexdrive_case_id,
    vcp.main_phase,
    vcp.sub_phase,
    c.auszahlung_gutachter_betrag,
    spd_termin.nachbesichtigung_kunde_termin_vorschlaege
   FROM faelle f
     LEFT JOIN claims c ON c.id = f.claim_id
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.technische_stellungnahme_status,
            a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am,
            a.technische_stellungnahme_freigabe_am
           FROM auftraege a
          WHERE a.claim_id = c.id
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.nachbesichtigung_status,
            gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht,
            gt.nachbesichtigung_sv_termin_vereinbart_am,
            gt.nachbesichtigung_kunde_termin_vorschlaege
           FROM gutachter_termine gt
          WHERE gt.claim_id = c.id
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
