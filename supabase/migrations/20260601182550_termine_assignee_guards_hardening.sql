-- Unisone Termin-Engine Phase 1 — Review-Hardening (adversarialer Review).
-- I-3: validate-Trigger-Funktion INVOKER -> SECURITY DEFINER. Sie macht Cross-Table-EXISTS
--   gegen RLS-geschuetzte Tabellen; als INVOKER wuerde ein kuenftiger Nicht-service_role-
--   Writer (Phase 3) false-geblockt, wenn RLS die referenzierte Zeile verbirgt. DEFINER +
--   search_path='' + voll qualifizierte Refs = die sichere Variante.
-- M-4: kundenbetreuer-Check zusaetzlich auf rolle='kundenbetreuer'.
CREATE OR REPLACE FUNCTION public.gutachter_termine_validate_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.assignee_typ = 'sachverstaendiger' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sachverstaendige WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sachverstaendige', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'sv_lead' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sv_leads WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in sv_leads', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kundenbetreuer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.assignee_id AND rolle = 'kundenbetreuer') THEN
      RAISE EXCEPTION 'assignee_id % nicht in profiles mit rolle kundenbetreuer', NEW.assignee_id;
    END IF;
  ELSIF NEW.assignee_typ = 'kanzlei' THEN
    IF NOT EXISTS (SELECT 1 FROM public.kanzleien WHERE id = NEW.assignee_id) THEN
      RAISE EXCEPTION 'assignee_id % nicht in kanzleien', NEW.assignee_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'assignee_id gesetzt, assignee_typ % ungueltig', NEW.assignee_typ;
  END IF;
  RETURN NEW;
END;
$fn$;

-- secdef-Hygiene (Repo-Konvention): kein public EXECUTE. Trigger-Funktionen feuern
-- unabhaengig von EXECUTE-Grants -> reine Absicherung.
REVOKE ALL ON FUNCTION public.gutachter_termine_validate_assignee() FROM public;

-- M-3: Buero-Join explizit typ-gaten (statt sich auf UUID-Namespace-Disjunktheit zu verlassen).
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
  AND COALESCE(gt.assignee_typ, CASE WHEN gt.sv_id IS NOT NULL THEN 'sachverstaendiger' END) = 'sachverstaendiger'
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

-- security_invoker + Grant-Lock nach CREATE OR REPLACE VIEW erneut sicherstellen.
ALTER VIEW public.v_belegung SET (security_invoker = true);
REVOKE ALL ON public.v_belegung FROM anon, authenticated;
