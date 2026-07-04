-- SP2: v_werkstatt_auftrag um den aktiven Reparaturtermin erweitern (additiv).
-- Bestehende Definition unveraendert; LEFT JOIN LATERAL auf den juengsten
-- nicht-stornierten reparatur_termine-Eintrag + 5 neue Spalten. Gate unveraendert.

CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS
 SELECT c.id AS claim_id,
    c.reparatur_vermittlung_status AS vermittlung_status,
    c.reparatur_werkstatt_quelle AS quelle,
    c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am,
        CASE
            WHEN c.reparatur_werkstatt_id IS NOT NULL THEN 'vermittelt'::text
            ELSE 'inbound'::text
        END AS richtung,
    c.claim_nummer,
    c.schadenart,
    c.reparaturwunsch,
    c.operative_status,
    v.hersteller AS fahrzeug_hersteller,
    NULLIF(concat_ws(' '::text, v.modell_haupttyp, v.modell_untertyp), ''::text) AS fahrzeug_modell,
    v.kennzeichen_aktuell AS kennzeichen,
    v.fin,
    gt.start_zeit AS besichtigung_start,
    gt.besichtigungsort_adresse AS besichtigung_ort,
    gt.status AS besichtigung_status,
    sv.firmenname AS gutachter_firmenname,
    COALESCE(NULLIF(concat_ws(' '::text, p.vorname, p.nachname), ''::text), NULLIF(concat_ws(' '::text, l.vorname, l.nachname), ''::text)) AS kunde_name,
    w.id AS werkstatt_id,
    w.name AS werkstatt_name,
    w.ansprechpartner_name AS werkstatt_ansprechpartner,
    wp.betrag_netto_eur AS provision_betrag_netto,
    wp.status AS provision_status,
    rt.id AS reparatur_termin_id,
    rt.status AS reparatur_termin_status,
    rt.wunschtermin AS reparatur_wunschtermin,
    rt.bestaetigter_termin AS reparatur_bestaetigter_termin,
    rt.absage_grund AS reparatur_absage_grund
   FROM claims c
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN LATERAL ( SELECT t.start_zeit,
            t.besichtigungsort_adresse,
            t.status
           FROM gutachter_termine t
          WHERE t.claim_id = c.id AND t.typ = 'sv_begutachtung'::text
          ORDER BY t.start_zeit DESC NULLS LAST
         LIMIT 1) gt ON true
     LEFT JOIN sachverstaendige sv ON sv.id = c.sv_id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN leads l ON l.id = c.lead_id
     LEFT JOIN werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
     LEFT JOIN werkstatt_provisionen wp ON wp.claim_id = c.id AND wp.werkstatt_id = w.id
     LEFT JOIN LATERAL ( SELECT rt_inner.id,
            rt_inner.status,
            rt_inner.wunschtermin,
            rt_inner.bestaetigter_termin,
            rt_inner.absage_grund
           FROM reparatur_termine rt_inner
          WHERE rt_inner.claim_id = c.id AND rt_inner.status <> 'storniert'::text
          ORDER BY rt_inner.created_at DESC
         LIMIT 1) rt ON true
  WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL) AND (is_staff() OR is_werkstatt_for_claim(c.id));
