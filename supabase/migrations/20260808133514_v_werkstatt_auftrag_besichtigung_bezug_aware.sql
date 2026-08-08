-- Tranche W (W1): Besichtigungs-LATERAL von v_werkstatt_auftrag bezug-aware machen.
-- Root-Cause: der Join lief NUR ueber die Legacy-Achse t.claim_id = c.id — Engine-/T1-Termine
-- sind bezug-nativ (bezug_typ='fall', bezug_id=claim, claim_id NULL) → Join matchte ~nie →
-- besichtigung_* NULL → Werkstatt sah den Gutachtertermin nicht (Spec 2026-08-05 §4.9 W1).
-- Zusatz: nichtige Termine (storniert/abgesagt/abgelehnt/verlegt) verdraengen den aktiven
-- nicht mehr. Spaltenliste IDENTISCH zur Vorversion → CREATE OR REPLACE, Grants bleiben.
create or replace view public.v_werkstatt_auftrag as
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
    wp.betrag_netto_eur::numeric(10,2) AS provision_betrag_netto,
    wp.status AS provision_status,
    rt.id AS reparatur_termin_id,
    rt.status AS reparatur_termin_status,
    rt.wunschtermin AS reparatur_wunschtermin,
    rt.bestaetigter_termin AS reparatur_bestaetigter_termin,
    rt.absage_grund AS reparatur_absage_grund,
    gu.bericht_pdf_url AS gutachten_bericht_pdf_url,
    gu.reparaturkosten_netto AS gutachten_reparaturkosten_netto,
    gu.reparaturkosten_brutto AS gutachten_reparaturkosten_brutto,
    gu.minderwert AS gutachten_minderwert,
    gu.restwert AS gutachten_restwert,
    gu.wiederbeschaffungswert AS gutachten_wiederbeschaffungswert,
    gu.totalschaden AS gutachten_totalschaden,
    gu.fertiggestellt_am AS gutachten_fertiggestellt_am,
    derive_abrechnungsweg(c.service_typ, COALESCE(c.schuldfrage, l.schuldfrage), COALESCE(c.eigene_versicherung, l.eigene_versicherung), c.schadenart) AS abrechnungsweg,
    c.werkstatt_id AS vermittler_werkstatt_id,
    c.reparatur_werkstatt_id,
        CASE
            WHEN (c.reparatur_werkstatt_id IN ( SELECT my_werkstatt_ids.my_werkstatt_ids
               FROM my_werkstatt_ids() my_werkstatt_ids(my_werkstatt_ids))) AND (c.werkstatt_id IN ( SELECT my_werkstatt_ids.my_werkstatt_ids
               FROM my_werkstatt_ids() my_werkstatt_ids(my_werkstatt_ids))) THEN 'beide'::text
            WHEN (c.reparatur_werkstatt_id IN ( SELECT my_werkstatt_ids.my_werkstatt_ids
               FROM my_werkstatt_ids() my_werkstatt_ids(my_werkstatt_ids))) THEN 'reparateur'::text
            WHEN (c.werkstatt_id IN ( SELECT my_werkstatt_ids.my_werkstatt_ids
               FROM my_werkstatt_ids() my_werkstatt_ids(my_werkstatt_ids))) THEN 'vermittler'::text
            ELSE NULL::text
        END AS meine_rolle,
    c.kostenvoranschlag_netto,
    c.kostenvoranschlag_brutto,
    c.reparatur_freigegeben_am,
    gu.wiederbeschaffungsdauer_tage AS reparaturdauer_tage,
    c.bkat_unfallart::text AS unfallart,
    c.reparaturdauer_tage_kva,
    rt.rueckruf_wunschzeit AS reparatur_rueckruf_wunschzeit,
    c.kva_abgelehnt_am,
    c.kva_abgelehnt_grund
   FROM claims c
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN LATERAL ( SELECT t.start_zeit,
            t.besichtigungsort_adresse,
            t.status
           FROM gutachter_termine t
          WHERE ((t.bezug_typ = ANY (ARRAY['fall'::text, 'claim'::text])) AND t.bezug_id = c.id
                 OR t.bezug_typ IS NULL AND (t.claim_id = c.id OR t.fall_id = c.id))
            AND t.typ = 'sv_begutachtung'::text
            AND (t.status <> ALL (ARRAY['storniert'::text, 'abgesagt'::text, 'abgelehnt'::text, 'verlegt'::text]))
          ORDER BY t.start_zeit DESC NULLS LAST
         LIMIT 1) gt ON true
     LEFT JOIN sachverstaendige sv ON sv.id = c.sv_id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN leads l ON l.id = c.lead_id
     LEFT JOIN werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
     LEFT JOIN partner_provisionen wp ON wp.claim_id = c.id AND wp.partner_id = w.id AND wp.partner_typ = 'werkstatt'::text
     LEFT JOIN LATERAL ( SELECT rt_inner.id,
            rt_inner.status,
            rt_inner.wunschtermin,
            rt_inner.bestaetigter_termin,
            rt_inner.absage_grund,
            rt_inner.rueckruf_wunschzeit
           FROM reparatur_termine rt_inner
          WHERE rt_inner.claim_id = c.id AND rt_inner.status <> 'storniert'::text
          ORDER BY rt_inner.created_at DESC
         LIMIT 1) rt ON true
     LEFT JOIN LATERAL ( SELECT g.bericht_pdf_url,
            g.reparaturkosten_netto,
            g.reparaturkosten_brutto,
            g.minderwert,
            g.restwert,
            g.wiederbeschaffungswert,
            g.totalschaden,
            g.fertiggestellt_am,
            g.wiederbeschaffungsdauer_tage
           FROM gutachten g
          WHERE g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
          ORDER BY g.fertiggestellt_am DESC
         LIMIT 1) gu ON true
  WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL) AND (is_staff() OR is_werkstatt_for_claim(c.id));
