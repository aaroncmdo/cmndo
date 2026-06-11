-- CMM-49 (fb34de27, Step 4): claims->bridge-Trigger.
-- Post-Identity-Converter-Deploy (1eb0febf #2692/Release #2698, atomic switch 17:34:32Z)
-- minten beide Prod-Pfade faelle.id := claim_id. Prod-verifiziert vor Apply:
--   verify-Row 0157c876 id==claim_id, post-switch faelle non_identity=0 (non-vacuous),
--   bridge 1:1 (81=81, fanout=0, null=0), UNIQUE(claim_id)-Guardrail live.
-- Zweck: erzeugt die Bridge-Row fuer JEDEN neuen Claim. Noetig sobald Step 5 (Entity)
-- den faelle-Insert stoppt -> dann ist claims->bridge die EINZIGE Bridge-Quelle.
-- Pre-Step-5 koexistiert er safe mit sync_faelle_claim_bridge (beide ON CONFLICT(fall_id);
-- bei Identity zielen beide auf dieselbe (C,C) -> Dedup, kein Fan-out). claim_id=NEW.id ist
-- fuer neue Claims frisch -> keine UNIQUE(claim_id)-Kollision.
-- SECURITY DEFINER + search_path=public analog sync_faelle_claim_bridge.
-- Bereits via apply_migration appliziert (recorded version 20260611180646); File = Regel-2-Tracking.

CREATE OR REPLACE FUNCTION public.sync_claims_to_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.faelle_claim_bridge (fall_id, claim_id)
  VALUES (NEW.id, NEW.id)
  ON CONFLICT (fall_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_claims_to_bridge
  AFTER INSERT ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claims_to_bridge();
