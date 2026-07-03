-- SP1 IN-Sync: v_belegung External-Teil profil-generisch. Robust + transitions-sicher:
-- attribuiert externe Cache-Events per sv_id (Bestand/alter-Cron-Fenster) ODER profile_id
-- → SV (via sachverstaendige.profile_id) bzw. Kundenbetreuer (profile_id = assignee_id).
-- SV-Bestand unveraendert (extern_sv 4→4 verifiziert); buchung/ausnahme-Teile unveraendert.
create or replace view v_belegung as
 SELECT COALESCE(gt.assignee_typ,
        CASE
            WHEN gt.sv_lead_id IS NOT NULL THEN 'sv_lead'::text
            WHEN gt.kb_id IS NOT NULL THEN 'kundenbetreuer'::text
            ELSE NULL::text
        END) AS assignee_typ,
    COALESCE(gt.assignee_id, gt.sv_lead_id, gt.kb_id) AS assignee_id,
    gt.start_zeit,
    gt.end_zeit,
    'buchung'::text AS belegung_typ,
    gt.status,
    gt.typ AS termin_typ,
        CASE
            WHEN gt.claim_id IS NOT NULL THEN 'claim'::text
            WHEN gt.fall_id IS NOT NULL THEN 'fall'::text
            WHEN gt.lead_id IS NOT NULL THEN 'lead'::text
            ELSE NULL::text
        END AS bezug_typ,
    COALESCE(gt.claim_id, gt.fall_id, gt.lead_id) AS bezug_id,
    COALESCE(gt.besichtigungsort_lat, sv.standort_lat) AS standort_lat,
    COALESCE(gt.besichtigungsort_lng, sv.standort_lng) AS standort_lng,
    gt.id AS quelle_id
   FROM gutachter_termine gt
     LEFT JOIN sachverstaendige sv ON sv.id = gt.assignee_id
  WHERE gt.cancelled_at IS NULL AND (gt.status = ANY (ARRAY['reserviert'::text, 'bestaetigt'::text, 'verlegt'::text, 'verlegung_pending'::text]))
UNION ALL
 SELECT
    CASE WHEN COALESCE(svid.id, svp.id) IS NOT NULL THEN 'sachverstaendiger'::text ELSE 'kundenbetreuer'::text END AS assignee_typ,
    COALESCE(svid.id, svp.id, c.profile_id) AS assignee_id,
    c.start_zeit,
    c.end_zeit,
    'extern'::text AS belegung_typ,
    NULL::text AS status,
    NULL::text AS termin_typ,
    NULL::text AS bezug_typ,
    NULL::uuid AS bezug_id,
    COALESCE(svid.standort_lat, svp.standort_lat) AS standort_lat,
    COALESCE(svid.standort_lng, svp.standort_lng) AS standort_lng,
    c.id AS quelle_id
   FROM sv_kalender_events_cache c
     LEFT JOIN sachverstaendige svid ON svid.id = c.sv_id
     LEFT JOIN sachverstaendige svp ON svp.profile_id = c.profile_id
UNION ALL
 SELECT va.assignee_typ,
    va.assignee_id,
    va.von AS start_zeit,
    va.bis AS end_zeit,
    'ausnahme'::text AS belegung_typ,
    va.typ AS status,
    NULL::text AS termin_typ,
    NULL::text AS bezug_typ,
    NULL::uuid AS bezug_id,
    NULL::numeric(10,7) AS standort_lat,
    NULL::numeric(10,7) AS standort_lng,
    va.id AS quelle_id
   FROM verfuegbarkeits_ausnahmen va;
