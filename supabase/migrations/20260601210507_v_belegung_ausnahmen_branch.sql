-- Unisone Termin-Engine Phase 2.1b / Task 2
-- v_belegung um einen 3. UNION-Branch 'ausnahme' erweitern -> verfuegbarkeits_ausnahmen
-- (urlaub/krank/sperre) fliessen als Belegung ein -> pruefeBelegung/ladeBelegung werden
-- automatisch vakanz-bewusst. Kein Ort (keine Routing-Destination, NULL::numeric(10,7)
-- exakt wie die bestehenden standort-Spalten -> CREATE OR REPLACE darf den Typ nicht aendern);
-- ausnahme-typ wird im status-Feld transportiert. Security-Lock (security_invoker + REVOKE)
-- re-appliziert. Gleiche 12 Spalten -> bricht keinen Reader (einziger Consumer = Engine).
CREATE OR REPLACE VIEW public.v_belegung AS
SELECT
  COALESCE(gt.assignee_typ,
    CASE WHEN gt.sv_id      IS NOT NULL THEN 'sachverstaendiger'
         WHEN gt.sv_lead_id IS NOT NULL THEN 'sv_lead'
         WHEN gt.kb_id      IS NOT NULL THEN 'kundenbetreuer' END) AS assignee_typ,
  COALESCE(gt.assignee_id, gt.sv_id, gt.sv_lead_id, gt.kb_id)      AS assignee_id,
  gt.start_zeit,
  gt.end_zeit,
  'buchung'::text AS belegung_typ,
  gt.status,
  gt.typ          AS termin_typ,
  CASE WHEN gt.claim_id IS NOT NULL THEN 'claim'
       WHEN gt.fall_id  IS NOT NULL THEN 'fall'
       WHEN gt.lead_id  IS NOT NULL THEN 'lead' END AS bezug_typ,
  COALESCE(gt.claim_id, gt.fall_id, gt.lead_id)       AS bezug_id,
  COALESCE(gt.besichtigungsort_lat, sv.standort_lat)  AS standort_lat,
  COALESCE(gt.besichtigungsort_lng, sv.standort_lng)  AS standort_lng,
  gt.id AS quelle_id
FROM public.gutachter_termine gt
LEFT JOIN public.sachverstaendige sv
  ON sv.id = COALESCE(gt.assignee_id, gt.sv_id)
WHERE gt.cancelled_at IS NULL
  AND gt.status = ANY (ARRAY['reserviert','bestaetigt','verlegt','verlegung_pending'])
UNION ALL
SELECT
  'sachverstaendiger'::text AS assignee_typ,
  c.sv_id                   AS assignee_id,
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
FROM public.sv_kalender_events_cache c
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id
UNION ALL
-- NEU (P2.1b): Verfuegbarkeits-Ausnahmen (urlaub/krank/sperre) als Belegung. Kein Ort
-- (keine Routing-Destination); typ wird im status-Feld transportiert (informativ).
SELECT
  va.assignee_typ,
  va.assignee_id,
  va.von  AS start_zeit,
  va.bis  AS end_zeit,
  'ausnahme'::text AS belegung_typ,
  va.typ  AS status,
  NULL::text AS termin_typ,
  NULL::text AS bezug_typ,
  NULL::uuid AS bezug_id,
  NULL::numeric(10,7) AS standort_lat,
  NULL::numeric(10,7) AS standort_lng,
  va.id AS quelle_id
FROM public.verfuegbarkeits_ausnahmen va;

ALTER VIEW public.v_belegung SET (security_invoker = true);
REVOKE ALL ON public.v_belegung FROM anon, authenticated;
