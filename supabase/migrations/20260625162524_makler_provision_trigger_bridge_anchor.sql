-- Fix: Provisions-Trigger von claims auf faelle_claim_bridge umankern.
-- Grund: makler_provisionen.fall_id hat FK -> faelle_claim_bridge(fall_id), die zur
-- AFTER-INSERT-claims-Zeit noch nicht existiert (Bridge wird via Bridge-Trigger erst nach dem
-- Claim-Insert angelegt) + Release-Cron skippt NULL-fall_id (route.ts:110). Anker auf die Bridge:
-- dann existieren Claim + valide fall_id. Jeder Claim hat genau eine Bridge (89/89/0 verifiziert).
-- Smoke verifiziert: Claim mit makler_id -> 1 makler_provisionen-Row, dual-rate korrekt, fall_id gesetzt.
CREATE OR REPLACE FUNCTION public.create_makler_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  -- NEW = faelle_claim_bridge-Row (fall_id, claim_id). Claim existiert sicher.
  SELECT makler_id, service_typ, lead_id INTO v_makler, v_service, v_lead
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv FROM public.makler WHERE id = v_makler;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE WHEN lower(COALESCE(v_service, '')) LIKE '%komplett%'
                   THEN COALESCE(v_komplett, 100) ELSE COALESCE(v_gutachter, 50) END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = v_lead;
  INSERT INTO public.makler_provisionen
    (makler_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    (v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo, v_betrag, v_service,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_makler_provision_on_claim ON public.claims;
DROP TRIGGER IF EXISTS trg_makler_provision_on_bridge ON public.faelle_claim_bridge;
CREATE TRIGGER trg_makler_provision_on_bridge
  AFTER INSERT ON public.faelle_claim_bridge
  FOR EACH ROW
  EXECUTE FUNCTION public.create_makler_provision();
