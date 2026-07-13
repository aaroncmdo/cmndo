-- #5 Firmen-Flotte-Provision (150 EUR inbound): erste Implementierung im Provisions-Modell.
-- Aaron 13.07.: eine Firma vermittelt UNS einen Claim -> 150 EUR inbound (analog werkstatt/makler).
-- Entscheidungen: AFTER INSERT (Claim-Anlage); partner_id = firmen_flotten_konten.id (Konto-Entitaet);
-- EXKLUSIVITAET (eine Vermittlung = eine Provision pro Claim): feuert nur, wenn der Claim NICHT schon
-- werkstatt-/makler-vermittelt ist (werkstatt_id/makler_id IS NULL). Join: claims.vehicle_id ->
-- flotten_fahrzeuge -> firmen_flotten_konten (status='aktiv'). Betrag 150 fix. Release = Phase 2
-- (generischer Cron). Makler<->Werkstatt-Exklusivitaet = Follow-up im Provisions-Konsolidierungs-Audit.

-- 1. partner_typ CHECK um 'firmen_flotte' erweitern (aktuell nur makler|werkstatt). Tabelle leer -> Validierung instant.
ALTER TABLE public.partner_provisionen DROP CONSTRAINT partner_provisionen_partner_typ_check;
ALTER TABLE public.partner_provisionen ADD CONSTRAINT partner_provisionen_partner_typ_check
  CHECK (partner_typ = ANY (ARRAY['makler'::text, 'werkstatt'::text, 'firmen_flotte'::text]));

-- 2. Trigger-Funktion (SECURITY DEFINER, gespiegelt aus create_werkstatt_provision).
CREATE OR REPLACE FUNCTION public.create_firmen_flotte_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_konto_id uuid;
BEGIN
  -- Exklusivitaet (Aaron 13.07.): genau EINE Vermittlungs-Provision pro Claim.
  -- Flotte nur, wenn der Claim nicht schon werkstatt-/makler-vermittelt ist.
  IF NEW.werkstatt_id IS NOT NULL OR NEW.makler_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Gehoert das Claim-Fahrzeug zu einer AKTIVEN Firmen-Flotte?
  SELECT k.id INTO v_konto_id
    FROM public.flotten_fahrzeuge ff
    JOIN public.firmen_flotten_konten k ON k.firma_id = ff.firma_id AND k.status = 'aktiv'
   WHERE ff.vehicle_id = NEW.vehicle_id
   LIMIT 1;
  IF v_konto_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('firmen_flotte', v_konto_id, NEW.id, NEW.id, NEW.claim_nummer, 150, 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3. Trigger AFTER INSERT (Claim-Anlage).
DROP TRIGGER IF EXISTS trg_firmen_flotte_provision_on_claim ON public.claims;
CREATE TRIGGER trg_firmen_flotte_provision_on_claim
  AFTER INSERT ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.create_firmen_flotte_provision();
