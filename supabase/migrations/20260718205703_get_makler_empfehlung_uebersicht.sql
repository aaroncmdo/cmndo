CREATE OR REPLACE FUNCTION public.get_makler_empfehlung_uebersicht(p_makler_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_upline jsonb;
  v_sponsor uuid;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.makler WHERE id = p_makler_id AND user_id = auth.uid())
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT sponsor_makler_id INTO v_sponsor FROM public.makler WHERE id = p_makler_id;
  IF v_sponsor IS NOT NULL THEN
    SELECT jsonb_build_object('makler_id', m.id, 'firma', m.firma,
                              'ansprechpartner_vorname', m.ansprechpartner_vorname)
      INTO v_upline FROM public.makler m WHERE m.id = v_sponsor;
  ELSE
    v_upline := NULL;
  END IF;

  WITH dl AS (
    SELECT d.id, d.firma, d.ansprechpartner_vorname, d.status,
      (SELECT count(*) FROM public.partner_provisionen pp
         WHERE pp.partner_typ = 'makler' AND pp.partner_id = d.id) AS gutachten_count,
      COALESCE((SELECT sum(o.betrag_netto_eur) FROM public.partner_provisionen o
         JOIN public.claims c ON c.id = o.claim_id
         WHERE o.partner_typ = 'makler_empfehlung' AND o.partner_id = p_makler_id
           AND c.makler_id = d.id), 0) AS override_netto_summe,
      COALESCE((SELECT sum(o.betrag_netto_eur) FROM public.partner_provisionen o
         JOIN public.claims c ON c.id = o.claim_id
         WHERE o.partner_typ = 'makler_empfehlung' AND o.partner_id = p_makler_id
           AND c.makler_id = d.id AND o.status = 'pending'), 0) AS override_pending_netto
    FROM public.makler d
    WHERE d.sponsor_makler_id = p_makler_id
    ORDER BY d.erstellt_am DESC
  )
  SELECT jsonb_build_object(
    'upline', v_upline,
    'downline', COALESCE(jsonb_agg(jsonb_build_object(
        'makler_id', dl.id, 'firma', dl.firma, 'ansprechpartner_vorname', dl.ansprechpartner_vorname,
        'status', dl.status, 'gutachten_count', dl.gutachten_count,
        'override_netto_summe', dl.override_netto_summe, 'override_pending_netto', dl.override_pending_netto)), '[]'::jsonb),
    'totals', jsonb_build_object(
        'downline_count', (SELECT count(*) FROM public.makler WHERE sponsor_makler_id = p_makler_id),
        'override_netto_gesamt', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id), 0),
        'override_pending', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id AND status='pending'), 0),
        'override_freigegeben', COALESCE((SELECT sum(betrag_netto_eur) FROM public.partner_provisionen
            WHERE partner_typ='makler_empfehlung' AND partner_id=p_makler_id AND status='freigegeben'), 0))
  ) INTO v_result FROM dl;

  RETURN v_result;
END; $function$;

REVOKE ALL ON FUNCTION public.get_makler_empfehlung_uebersicht(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_makler_empfehlung_uebersicht(uuid) TO authenticated;
