-- Werkstatt-Vermittler WP-A Task 3: Provisions-Trigger.
-- Faellig bei Claim-Erstellung: AFTER INSERT ON claims (WHEN werkstatt_id NOT NULL) legt
-- genau eine werkstatt_provisionen-Zeile an (status='pending', hold_until=now()+7d Clawback).
-- fall_id := NEW.id (post-CMM-49-D2 ist fall_id == claim_id). ON CONFLICT (claim_id) DO NOTHING.
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  INSERT INTO public.werkstatt_provisionen
    (werkstatt_id, claim_id, fall_id, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    (NEW.werkstatt_id, NEW.id, NEW.id, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (claim_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_werkstatt_provision_on_claim ON public.claims;
CREATE TRIGGER trg_werkstatt_provision_on_claim
  AFTER INSERT ON public.claims
  FOR EACH ROW WHEN (NEW.werkstatt_id IS NOT NULL)
  EXECUTE FUNCTION public.create_werkstatt_provision();
