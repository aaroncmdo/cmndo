-- Unisone Termin-Engine Phase 1 / Task 4
-- v_belegung: die EINE Lese-Quelle (Claimondo-Buchungen ∪ externe Belegung), assignee-
-- generisch, mit Buero-Fallback (COALESCE besichtigungsort/sachverstaendige.standort).
-- assignee wird live aus den Legacy-FKs abgeleitet (COALESCE), damit Transitions-Writer
-- (setzen bis Phase 3 nur sv_id) korrekt erscheinen. Status-Set == Exclusion-Constraint
-- gutachter_termine_no_sv_overlap (aktive Buchungen). KEIN Phase-1-Consumer (die Engine
-- liest die View ab Phase 2). REVOKE anon (Audit-Lehre: keine SV-Spalten an anon).
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
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id;

REVOKE ALL ON public.v_belegung FROM anon;
