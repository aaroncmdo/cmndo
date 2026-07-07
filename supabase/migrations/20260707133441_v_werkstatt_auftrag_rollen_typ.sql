-- D (Werkstatt-Auftrags-Ansicht): v_werkstatt_auftrag rollen-korrekt erweitern (additiv).
-- Bestehende Definition (SP2/SP3, inkl. reparatur_termine- + gutachten-LATERAL) 1:1
-- uebernommen; 4 neue Spalten ANS ENDE (CREATE OR REPLACE VIEW erlaubt nur Append):
--   abrechnungsweg          -- Selbstzahler vs Haftpflicht/Kasko (Fluss-Typ)
--   vermittler_werkstatt_id -- c.werkstatt_id (Vermittler-Rolle), getrennt vom COALESCE
--   reparatur_werkstatt_id  -- c.reparatur_werkstatt_id (Reparateur-Rolle), getrennt
--   meine_rolle             -- reparateur/vermittler/beide/NULL gg die fragende Werkstatt
-- meine_rolle nutzt den SECURITY-DEFINER-Helper my_werkstatt_ids() (kein RLS-Gamble
-- aufs werkstaetten-SELECT; analog is_werkstatt_for_claim). Gate unveraendert.

-- Helper: die Werkstatt-IDs des aktuellen Users.
CREATE OR REPLACE FUNCTION public.my_werkstatt_ids()
 RETURNS setof uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid())
$function$;
REVOKE ALL ON FUNCTION public.my_werkstatt_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_werkstatt_ids() TO authenticated, service_role;

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
    rt.absage_grund AS reparatur_absage_grund,
    gu.bericht_pdf_url AS gutachten_bericht_pdf_url,
    gu.reparaturkosten_netto AS gutachten_reparaturkosten_netto,
    gu.reparaturkosten_brutto AS gutachten_reparaturkosten_brutto,
    gu.minderwert AS gutachten_minderwert,
    gu.restwert AS gutachten_restwert,
    gu.wiederbeschaffungswert AS gutachten_wiederbeschaffungswert,
    gu.totalschaden AS gutachten_totalschaden,
    gu.fertiggestellt_am AS gutachten_fertiggestellt_am,
    c.abrechnungsweg AS abrechnungsweg,
    c.werkstatt_id AS vermittler_werkstatt_id,
    c.reparatur_werkstatt_id AS reparatur_werkstatt_id,
        CASE
            WHEN c.reparatur_werkstatt_id IN (SELECT * FROM my_werkstatt_ids())
             AND c.werkstatt_id           IN (SELECT * FROM my_werkstatt_ids()) THEN 'beide'::text
            WHEN c.reparatur_werkstatt_id IN (SELECT * FROM my_werkstatt_ids()) THEN 'reparateur'::text
            WHEN c.werkstatt_id           IN (SELECT * FROM my_werkstatt_ids()) THEN 'vermittler'::text
            ELSE NULL::text
        END AS meine_rolle
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
     LEFT JOIN LATERAL ( SELECT g.bericht_pdf_url,
            g.reparaturkosten_netto,
            g.reparaturkosten_brutto,
            g.minderwert,
            g.restwert,
            g.wiederbeschaffungswert,
            g.totalschaden,
            g.fertiggestellt_am
           FROM gutachten g
          WHERE g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
          ORDER BY g.fertiggestellt_am DESC
         LIMIT 1) gu ON true
  WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL) AND (is_staff() OR is_werkstatt_for_claim(c.id));
