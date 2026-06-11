-- CMM-49: v_belegung haengt (pg_depend) an gutachter_termine.sv_id -- als COALESCE-Fallback
-- (assignee_id ?? sv_id ?? sv_lead_id ?? kb_id) + assignee_typ-CASE + sachverstaendige-JOIN.
-- Da assignee_id/assignee_typ immer populiert sind (svid_divergent=0, assignee_null=0) ist der
-- sv_id-Fallback tot -> entfernt, damit DROP COLUMN gutachter_termine.sv_id moeglich wird.
-- Value-identisch verifiziert (Full-Row-MD5 before==after: 6ba43bedc6f0ee17a5b4602a86b8df23, n=17).
-- c.sv_id (sv_kalender_events_cache, 2. UNION-Branch) = Fremd-Tabelle, bleibt unangetastet.
CREATE OR REPLACE VIEW v_belegung AS
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
 SELECT 'sachverstaendiger'::text AS assignee_typ,
    c.sv_id AS assignee_id,
    c.start_zeit,
    c.end_zeit,
    'extern'::text AS belegung_typ,
    NULL::text AS status,
    NULL::text AS termin_typ,
    NULL::text AS bezug_typ,
    NULL::uuid AS bezug_id,
    sv.standort_lat,
    sv.standort_lng,
    c.id AS quelle_id
   FROM sv_kalender_events_cache c
     LEFT JOIN sachverstaendige sv ON sv.id = c.sv_id
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
