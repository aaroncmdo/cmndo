-- WS6 Money-Hebel (Handoff von 62dd5486, PR #4109): reparatur-vermittelte Claims (Selbstzahler/Kasko-frei)
-- bekamen KEINE partner_provisionen. Der Trigger create_werkstatt_provision keyt nur auf werkstatt_id@INSERT
-- (QR-Inbound); der Werkstatt-Picker setzt aber reparatur_werkstatt_id per UPDATE -> kein Trigger, kein Umsatz.
-- Die Vermittlungs-Provision ist der EINZIGE Claimondo-Umsatz dieser unbetreuten Claims.
-- Fix: neuer AFTER-UPDATE-Trigger auf reparatur_werkstatt_id (null->set), gespiegelt zu create_werkstatt_provision.
-- ON CONFLICT (partner_typ, claim_id) DO NOTHING -> QR-Inbound (@INSERT-Provision) bekommt keine zweite.
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision_on_reparatur_assign()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.reparatur_werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.reparatur_werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('werkstatt', NEW.reparatur_werkstatt_id, NEW.id, NEW.id, NEW.claim_nummer, COALESCE(v_betrag, 150),
     'reparatur_vermittelt', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_werkstatt_provision_on_reparatur_assign
  AFTER UPDATE OF reparatur_werkstatt_id ON public.claims
  FOR EACH ROW
  WHEN (NEW.reparatur_werkstatt_id IS NOT NULL AND OLD.reparatur_werkstatt_id IS NULL)
  EXECUTE FUNCTION public.create_werkstatt_provision_on_reparatur_assign();

-- Backfill der bestehenden reparatur-vermittelten Claims ohne Provision (heute 3, alle Test/Smoke,
-- provision_aktiv). Completed (reparatur_erledigt) -> direkt 'freigegeben', sonst 'pending'.
INSERT INTO public.partner_provisionen
  (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
SELECT 'werkstatt', c.reparatur_werkstatt_id, c.id, c.id, c.claim_nummer, COALESCE(w.provision_betrag_netto, 150),
       'reparatur_vermittelt_backfill', now(), now() + interval '7 days',
       CASE WHEN c.operative_status = 'abgeschlossen' AND c.geschlossen_grund = 'reparatur_erledigt'
            THEN 'freigegeben' ELSE 'pending' END
FROM public.claims c
JOIN public.werkstaetten w ON w.id = c.reparatur_werkstatt_id
WHERE c.reparatur_werkstatt_id IS NOT NULL
  AND COALESCE(w.provision_aktiv, false) = true
  AND NOT EXISTS (SELECT 1 FROM public.partner_provisionen pp WHERE pp.claim_id = c.id AND pp.partner_typ = 'werkstatt')
ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
