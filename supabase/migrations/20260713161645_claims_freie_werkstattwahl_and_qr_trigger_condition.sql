-- claims.freie_werkstattwahl: kanonisches Signal vom Lead auf den Claim durchreichen
-- (leads hatte es schon via 20260708185733, claims nicht). null=unbekannt/nicht gefragt,
-- true=freie Wahl (wir vermitteln), false=Versicherer-gebunden. Aus dem convert-lead-claim-
-- Mapping-Audit (Aaron 11.07.).
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS freie_werkstattwahl boolean;

-- Trigger set_reparatur_werkstatt_from_qr: kein Auto-qr_referral-Reparateur, wenn der Kunde
-- frei waehlen will (freie_werkstattwahl=true). Ansonsten identisch zur Ist-Def (Test-Guard +
-- Entkopplung IS DISTINCT FROM 'fiktiv' bleiben). Verhaltensneutral, bis ein Consumer
-- freie_werkstattwahl=true auf einem Claim setzt (bis dahin NULL -> IS NOT TRUE = true).
CREATE OR REPLACE FUNCTION public.set_reparatur_werkstatt_from_qr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ws_email text;
  v_kunde_email text;
BEGIN
  IF NEW.werkstatt_id IS NOT NULL
     AND NEW.reparaturwunsch IS DISTINCT FROM 'fiktiv'
     AND NEW.reparatur_werkstatt_id IS NULL
     AND NEW.freie_werkstattwahl IS NOT TRUE
  THEN
    SELECT email INTO v_ws_email FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
    IF NEW.geschaedigter_user_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.profiles WHERE id = NEW.geschaedigter_user_id;
    END IF;
    IF v_kunde_email IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    -- TEST-GUARD: nur zuweisen, wenn Werkstatt + Kunde dieselbe Test-Ness haben.
    IF public.ist_interne_email(v_ws_email) = public.ist_interne_email(v_kunde_email) THEN
      NEW.reparatur_werkstatt_id := NEW.werkstatt_id;
      NEW.reparatur_werkstatt_quelle := 'qr_referral';
      NEW.reparatur_werkstatt_zugewiesen_am := COALESCE(NEW.reparatur_werkstatt_zugewiesen_am, now());
      NEW.reparatur_vermittlung_status := 'vermittelt';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
