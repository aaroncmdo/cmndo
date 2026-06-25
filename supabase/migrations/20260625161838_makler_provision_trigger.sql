-- Makler-Vermittlung: Provisions-Trigger (Werkstatt-Paritaet).
-- AFTER INSERT ON claims WHEN makler_id NOT NULL -> genau eine makler_provisionen-Zeile.
-- dual-rate: claim.service_typ 'komplett' -> provision_betrag_komplett_netto, sonst _nur_gutachter_netto.
-- HINWEIS: dieser claims-Anker ist in 20260625162524 auf faelle_claim_bridge umgeankert worden
-- (makler_provisionen.fall_id FK -> faelle_claim_bridge existiert zur claims-INSERT-Zeit noch nicht).
ALTER TABLE public.makler_provisionen
  DROP CONSTRAINT IF EXISTS makler_provisionen_claim_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS makler_provisionen_claim_id_uniq
  ON public.makler_provisionen (claim_id) WHERE claim_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_makler_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  IF NEW.makler_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv
    FROM public.makler WHERE id = NEW.makler_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE
    WHEN lower(COALESCE(NEW.service_typ, '')) LIKE '%komplett%' THEN COALESCE(v_komplett, 100)
    ELSE COALESCE(v_gutachter, 50)
  END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = NEW.lead_id;
  INSERT INTO public.makler_provisionen
    (makler_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    (NEW.makler_id, NEW.id, NEW.id, NEW.lead_id, v_promo, v_betrag, NEW.service_typ,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_makler_provision_on_claim ON public.claims;
CREATE TRIGGER trg_makler_provision_on_claim
  AFTER INSERT ON public.claims
  FOR EACH ROW WHEN (NEW.makler_id IS NOT NULL)
  EXECUTE FUNCTION public.create_makler_provision();
