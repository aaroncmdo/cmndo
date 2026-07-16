-- harden_provision_triggers (Prod-Smoke 17.07. deckte 2 Trigger-Bugs auf):
--  (1) PROD-BREAKER: trg_firmen_flotte_provision_on_claim feuerte ALPHABETISCH vor
--      trg_sync_claims_to_bridge -> die Flotten-Provision (partner_provisionen.claim_id
--      -FK auf faelle_claim_bridge.claim_id) wurde angelegt, bevor die Bridge existierte
--      -> FK-Violation -> der ganze claims-INSERT rollte zurueck (jeder Flotten-Claim
--      nicht anlegbar). Fix: den Trigger auf faelle_claim_bridge AFTER INSERT verlegen
--      (robustes Muster wie create_makler_provision; feuert garantiert NACH der Bridge).
--  (2) Cross-Typ-Doppel: bei vermittler_typ=NULL feuerten makler- UND werkstatt-Trigger
--      beide (Fallback aufs Roh-Signal) -> 2 Provisionen am selben Claim. Fix: Makler-
--      Praezedenz im werkstatt-NULL-Fallback spiegeln (AND makler_id IS NULL).
-- Regression-Pin: tests/e2e/flows/provisionen-verrechnung-smoke.spec.ts (S6 + DOPPEL-PROBE).

-- (1a) Alten claims-Trigger entfernen (bevor die Funktion auf bridge-Kontext umgestellt wird).
DROP TRIGGER IF EXISTS trg_firmen_flotte_provision_on_claim ON public.claims;

-- (1b) Funktion fuer bridge-Kontext: NEW = faelle_claim_bridge-Row -> Claim-Felder via SELECT.
CREATE OR REPLACE FUNCTION public.create_firmen_flotte_provision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_firma_id uuid;
  v_vermittler_typ text; v_werkstatt_id uuid; v_makler_id uuid; v_vehicle_id uuid; v_claim_nummer text;
BEGIN
  SELECT vermittler_typ, werkstatt_id, makler_id, vehicle_id, claim_nummer
    INTO v_vermittler_typ, v_werkstatt_id, v_makler_id, v_vehicle_id, v_claim_nummer
    FROM public.claims WHERE id = NEW.claim_id;

  -- Exklusivitaet (unveraendert; Signale jetzt aus dem SELECT statt NEW).
  IF v_vermittler_typ IS NOT NULL THEN
    IF v_vermittler_typ IS DISTINCT FROM 'firmen_flotte' THEN RETURN NEW; END IF;
  ELSE
    IF v_werkstatt_id IS NOT NULL OR v_makler_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;
  IF v_vehicle_id IS NULL THEN RETURN NEW; END IF;

  SELECT ff.firma_id INTO v_firma_id
    FROM public.flotten_fahrzeuge ff
    JOIN public.firmen_flotten_konten k ON k.firma_id = ff.firma_id AND k.status = 'aktiv'
   WHERE ff.vehicle_id = v_vehicle_id
   LIMIT 1;
  IF v_firma_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('firmen_flotte', v_firma_id, NEW.claim_id, NEW.fall_id, v_claim_nummer, 150, 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- (1c) Neuen Trigger auf der Bridge (feuert garantiert nach ihrer Existenz).
CREATE TRIGGER trg_firmen_flotte_provision_on_bridge
  AFTER INSERT ON public.faelle_claim_bridge
  FOR EACH ROW EXECUTE FUNCTION public.create_firmen_flotte_provision();

-- (2) Werkstatt-NULL-Fallback um Makler-Praezedenz-Guard (verhindert Cross-Typ-Doppel).
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.vermittler_typ IS NOT NULL THEN
    IF NEW.vermittler_typ IS DISTINCT FROM 'werkstatt' THEN RETURN NEW; END IF;
  ELSE
    -- NULL-Fallback: Makler hat Praezedenz (makler > werkstatt) -> keine Werkstatt-Provision,
    -- wenn makler_id gesetzt ist. Spiegelt den Guard des Flotte-Triggers -> kein Cross-Typ-Doppel.
    IF NEW.makler_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('werkstatt', NEW.werkstatt_id, NEW.id, NEW.id, NEW.claim_nummer, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;
