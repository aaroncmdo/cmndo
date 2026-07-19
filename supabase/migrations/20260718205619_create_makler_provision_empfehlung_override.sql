CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
  v_vermittler_typ text;
  v_sponsor uuid;
BEGIN
  SELECT makler_id, service_typ, lead_id, vermittler_typ
    INTO v_makler, v_service, v_lead, v_vermittler_typ
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

  IF v_vermittler_typ IS NOT NULL AND v_vermittler_typ IS DISTINCT FROM 'makler' THEN
    RETURN NEW;
  END IF;

  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv FROM public.makler WHERE id = v_makler;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE WHEN lower(COALESCE(v_service, '')) LIKE '%komplett%'
                   THEN COALESCE(v_komplett, 100) ELSE COALESCE(v_gutachter, 50) END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = v_lead;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    ('makler', v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo, v_betrag, v_service,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;

  -- Empfehlungs-Override (Single-Level): 10 EUR an den direkten Werber, wenn dieser aktiv provisioniert.
  SELECT sponsor_makler_id INTO v_sponsor FROM public.makler WHERE id = v_makler;
  IF v_sponsor IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.makler WHERE id = v_sponsor AND provision_aktiv) THEN
    INSERT INTO public.partner_provisionen
      (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
       trigger_event, trigger_at, hold_until, status)
    VALUES
      ('makler_empfehlung', v_sponsor, NEW.claim_id, NEW.fall_id, v_lead, v_promo, 10, v_service,
       'empfehlung_override', now(), now() + interval '7 days', 'pending')
    ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;
