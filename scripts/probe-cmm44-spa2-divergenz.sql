-- CMM-44 SP-A2 — Divergenz-Probe der 30 Semantik-DUP-Paare faelle -> claims
-- f_nn = faelle-Spalte non-NULL, c_nn = claims-Ziel non-NULL,
-- diverge = Zeilen wo faelle-Wert vom claims-Wert abweicht (IS DISTINCT FROM, ::text-Cast)
WITH p AS (
 SELECT f.*, c.hergang_kunde_text c_hkt, c.schadentag c_st, c.entdeckt_am c_ea,
   c.schadenort_adresse c_soa, c.schadenort_plz c_sop, c.schadenort_ort c_soo, c.fall_typ c_ft,
   c.hat_personenschaden c_hps, c.halter_ungleich_fahrer c_huf, c.schadenart c_sa,
   c.schadenort_kategorie c_sok, c.hat_sachschaden c_hss, c.schadenzeit c_sz,
   c.schadenort_lat c_slat, c.schadenort_lng c_slng, c.anzahl_beteiligte_total c_abt,
   c.gegner_aktenzeichen c_gak, c.kunde_no_show_count c_knsc, c.sv_no_show_count c_snsc,
   c.phase c_ph, c.claim_nummer c_cn, c.lead_id c_lid, c.hat_mietwagen c_hmw,
   c.hat_nutzungsausfall c_hna, c.regulierungs_betrag c_rb, c.vs_ablehnungs_grund c_vag
 FROM faelle f JOIN claims c ON f.claim_id = c.id
)
SELECT pair, f_nn, c_nn, diverge FROM (
 SELECT 'schadens_beschreibung|hergang_kunde_text' pair, count(*) FILTER(WHERE schadens_beschreibung IS NOT NULL) f_nn, count(*) FILTER(WHERE c_hkt IS NOT NULL) c_nn, count(*) FILTER(WHERE schadens_beschreibung::text IS DISTINCT FROM c_hkt::text) diverge, 1 ord FROM p
 UNION ALL SELECT 'unfallhergang|hergang_kunde_text', count(*) FILTER(WHERE unfallhergang IS NOT NULL), count(*) FILTER(WHERE c_hkt IS NOT NULL), count(*) FILTER(WHERE unfallhergang::text IS DISTINCT FROM c_hkt::text), 2 FROM p
 UNION ALL SELECT 'schadens_hergang|hergang_kunde_text', count(*) FILTER(WHERE schadens_hergang IS NOT NULL), count(*) FILTER(WHERE c_hkt IS NOT NULL), count(*) FILTER(WHERE schadens_hergang::text IS DISTINCT FROM c_hkt::text), 3 FROM p
 UNION ALL SELECT 'schadens_datum|schadentag', count(*) FILTER(WHERE schadens_datum IS NOT NULL), count(*) FILTER(WHERE c_st IS NOT NULL), count(*) FILTER(WHERE schadens_datum::text IS DISTINCT FROM c_st::text), 4 FROM p
 UNION ALL SELECT 'unfalldatum|schadentag', count(*) FILTER(WHERE unfalldatum IS NOT NULL), count(*) FILTER(WHERE c_st IS NOT NULL), count(*) FILTER(WHERE unfalldatum::text IS DISTINCT FROM c_st::text), 5 FROM p
 UNION ALL SELECT 'schadens_entdeckt_am|entdeckt_am', count(*) FILTER(WHERE schadens_entdeckt_am IS NOT NULL), count(*) FILTER(WHERE c_ea IS NOT NULL), count(*) FILTER(WHERE schadens_entdeckt_am::text IS DISTINCT FROM c_ea::text), 6 FROM p
 UNION ALL SELECT 'schadens_adresse|schadenort_adresse', count(*) FILTER(WHERE schadens_adresse IS NOT NULL), count(*) FILTER(WHERE c_soa IS NOT NULL), count(*) FILTER(WHERE schadens_adresse::text IS DISTINCT FROM c_soa::text), 7 FROM p
 UNION ALL SELECT 'unfallort|schadenort_adresse', count(*) FILTER(WHERE unfallort IS NOT NULL), count(*) FILTER(WHERE c_soa IS NOT NULL), count(*) FILTER(WHERE unfallort::text IS DISTINCT FROM c_soa::text), 8 FROM p
 UNION ALL SELECT 'schadens_plz|schadenort_plz', count(*) FILTER(WHERE schadens_plz IS NOT NULL), count(*) FILTER(WHERE c_sop IS NOT NULL), count(*) FILTER(WHERE schadens_plz::text IS DISTINCT FROM c_sop::text), 9 FROM p
 UNION ALL SELECT 'schadens_ort|schadenort_ort', count(*) FILTER(WHERE schadens_ort IS NOT NULL), count(*) FILTER(WHERE c_soo IS NOT NULL), count(*) FILTER(WHERE schadens_ort::text IS DISTINCT FROM c_soo::text), 10 FROM p
 UNION ALL SELECT 'schadens_fall_typ|fall_typ', count(*) FILTER(WHERE schadens_fall_typ IS NOT NULL), count(*) FILTER(WHERE c_ft IS NOT NULL), count(*) FILTER(WHERE schadens_fall_typ::text IS DISTINCT FROM c_ft::text), 11 FROM p
 UNION ALL SELECT 'personenschaden_flag|hat_personenschaden', count(*) FILTER(WHERE personenschaden_flag IS NOT NULL), count(*) FILTER(WHERE c_hps IS NOT NULL), count(*) FILTER(WHERE personenschaden_flag::text IS DISTINCT FROM c_hps::text), 12 FROM p
 UNION ALL SELECT 'halter_ungleich_fahrer_flag|halter_ungleich_fahrer', count(*) FILTER(WHERE halter_ungleich_fahrer_flag IS NOT NULL), count(*) FILTER(WHERE c_huf IS NOT NULL), count(*) FILTER(WHERE halter_ungleich_fahrer_flag::text IS DISTINCT FROM c_huf::text), 13 FROM p
 UNION ALL SELECT 'schadens_art|schadenart', count(*) FILTER(WHERE schadens_art IS NOT NULL), count(*) FILTER(WHERE c_sa IS NOT NULL), count(*) FILTER(WHERE schadens_art::text IS DISTINCT FROM c_sa::text), 14 FROM p
 UNION ALL SELECT 'unfallort_kategorie|schadenort_kategorie', count(*) FILTER(WHERE unfallort_kategorie IS NOT NULL), count(*) FILTER(WHERE c_sok IS NOT NULL), count(*) FILTER(WHERE unfallort_kategorie::text IS DISTINCT FROM c_sok::text), 15 FROM p
 UNION ALL SELECT 'sachschaden_flag|hat_sachschaden', count(*) FILTER(WHERE sachschaden_flag IS NOT NULL), count(*) FILTER(WHERE c_hss IS NOT NULL), count(*) FILTER(WHERE sachschaden_flag::text IS DISTINCT FROM c_hss::text), 16 FROM p
 UNION ALL SELECT 'unfall_uhrzeit|schadenzeit', count(*) FILTER(WHERE unfall_uhrzeit IS NOT NULL), count(*) FILTER(WHERE c_sz IS NOT NULL), count(*) FILTER(WHERE unfall_uhrzeit::text IS DISTINCT FROM c_sz::text), 17 FROM p
 UNION ALL SELECT 'unfallort_lat|schadenort_lat', count(*) FILTER(WHERE unfallort_lat IS NOT NULL), count(*) FILTER(WHERE c_slat IS NOT NULL), count(*) FILTER(WHERE unfallort_lat::text IS DISTINCT FROM c_slat::text), 18 FROM p
 UNION ALL SELECT 'unfallort_lng|schadenort_lng', count(*) FILTER(WHERE unfallort_lng IS NOT NULL), count(*) FILTER(WHERE c_slng IS NOT NULL), count(*) FILTER(WHERE unfallort_lng::text IS DISTINCT FROM c_slng::text), 19 FROM p
 UNION ALL SELECT 'gegner_anzahl_beteiligte|anzahl_beteiligte_total', count(*) FILTER(WHERE gegner_anzahl_beteiligte IS NOT NULL), count(*) FILTER(WHERE c_abt IS NOT NULL), count(*) FILTER(WHERE gegner_anzahl_beteiligte::text IS DISTINCT FROM c_abt::text), 20 FROM p
 UNION ALL SELECT 'gegner_schadennummer|gegner_aktenzeichen', count(*) FILTER(WHERE gegner_schadennummer IS NOT NULL), count(*) FILTER(WHERE c_gak IS NOT NULL), count(*) FILTER(WHERE gegner_schadennummer::text IS DISTINCT FROM c_gak::text), 21 FROM p
 UNION ALL SELECT 'no_show_count|kunde_no_show_count', count(*) FILTER(WHERE no_show_count IS NOT NULL), count(*) FILTER(WHERE c_knsc IS NOT NULL), count(*) FILTER(WHERE no_show_count::text IS DISTINCT FROM c_knsc::text), 22 FROM p
 UNION ALL SELECT 'no_show_count|sv_no_show_count', count(*) FILTER(WHERE no_show_count IS NOT NULL), count(*) FILTER(WHERE c_snsc IS NOT NULL), count(*) FILTER(WHERE no_show_count::text IS DISTINCT FROM c_snsc::text), 23 FROM p
 UNION ALL SELECT 'aktuelle_phase|phase', count(*) FILTER(WHERE aktuelle_phase IS NOT NULL), count(*) FILTER(WHERE c_ph IS NOT NULL), count(*) FILTER(WHERE aktuelle_phase::text IS DISTINCT FROM c_ph::text), 24 FROM p
 UNION ALL SELECT 'fall_nummer|claim_nummer', count(*) FILTER(WHERE fall_nummer IS NOT NULL), count(*) FILTER(WHERE c_cn IS NOT NULL), count(*) FILTER(WHERE fall_nummer::text IS DISTINCT FROM c_cn::text), 25 FROM p
 UNION ALL SELECT 'konvertiert_von_lead|lead_id', count(*) FILTER(WHERE konvertiert_von_lead IS NOT NULL), count(*) FILTER(WHERE c_lid IS NOT NULL), count(*) FILTER(WHERE konvertiert_von_lead::text IS DISTINCT FROM c_lid::text), 26 FROM p
 UNION ALL SELECT 'mietwagen_flag|hat_mietwagen', count(*) FILTER(WHERE mietwagen_flag IS NOT NULL), count(*) FILTER(WHERE c_hmw IS NOT NULL), count(*) FILTER(WHERE mietwagen_flag::text IS DISTINCT FROM c_hmw::text), 27 FROM p
 UNION ALL SELECT 'mietwagen_hat|hat_mietwagen', count(*) FILTER(WHERE mietwagen_hat IS NOT NULL), count(*) FILTER(WHERE c_hmw IS NOT NULL), count(*) FILTER(WHERE mietwagen_hat::text IS DISTINCT FROM c_hmw::text), 28 FROM p
 UNION ALL SELECT 'nutzungsausfall|hat_nutzungsausfall', count(*) FILTER(WHERE nutzungsausfall IS NOT NULL), count(*) FILTER(WHERE c_hna IS NOT NULL), count(*) FILTER(WHERE nutzungsausfall::text IS DISTINCT FROM c_hna::text), 29 FROM p
 UNION ALL SELECT 'regulierung_betrag|regulierungs_betrag', count(*) FILTER(WHERE regulierung_betrag IS NOT NULL), count(*) FILTER(WHERE c_rb IS NOT NULL), count(*) FILTER(WHERE regulierung_betrag::text IS DISTINCT FROM c_rb::text), 30 FROM p
 UNION ALL SELECT 'vs_ablehnungsgrund|vs_ablehnungs_grund', count(*) FILTER(WHERE vs_ablehnungsgrund IS NOT NULL), count(*) FILTER(WHERE c_vag IS NOT NULL), count(*) FILTER(WHERE vs_ablehnungsgrund::text IS DISTINCT FROM c_vag::text), 31 FROM p
) q ORDER BY ord;
