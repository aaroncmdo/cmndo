-- Makler-Sichtbarkeit: wenn ein makler-vermittelter Lead konvertiert (Bridge-Insert),
-- bekommt der vermittelnde Makler automatisch makler_fall_consent (Vollzugriff), damit
-- er seine Akte im Portal sieht/oeffnen kann. Vorher wurde Consent NIRGENDS erzeugt
-- (nur 1 alter Seed) -> jeder konvertierte Makler-Fall zeigte 'kein_account' = "nicht
-- gezaehlt". ENTKOPPELT von createKundeAccount: ein Account-Fail (z.B. Kunde-Email gehoert
-- schon einem Staff-Account) versteckt den Fall nicht mehr vor dem Makler.
-- Scope 'vollzugriff' = Aaron-Entscheid 2026-06-29 (Makler ist B2B-Vermittler/Berater des
-- Kunden; Legal-Grundlage der Vermittlungsbeziehung = Aaron). claim_sichtbar_fuer_aktuellen_user
-- gated bereits auf einen nicht-widerrufenen makler_fall_consent (scope-unabhaengig) -> Read-Path live.
CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  -- NEW = faelle_claim_bridge-Row (fall_id, claim_id). Claim existiert sicher.
  SELECT makler_id, service_typ, lead_id INTO v_makler, v_service, v_lead
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  -- Sichtbarkeit VOR dem provision_aktiv-Gate: Sichtbarkeit != Provisions-Eligibility.
  -- Auch ein Makler ohne aktive Provision soll seinen vermittelten Fall sehen. Idempotent
  -- ueber UNIQUE(fall_id, makler_id).
  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

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
END; $function$;

-- Backfill: bereits konvertierte makler-vermittelte Faelle ohne Consent bekommen
-- rueckwirkend Vollzugriff (sonst bleiben sie 'kein_account' im Makler-Portal).
INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
SELECT b.fall_id, c.id, c.makler_id, 'vollzugriff', now()
FROM public.claims c
JOIN public.faelle_claim_bridge b ON b.claim_id = c.id
WHERE c.makler_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.makler_fall_consent mc
    WHERE mc.fall_id = b.fall_id AND mc.makler_id = c.makler_id
  )
ON CONFLICT (fall_id, makler_id) DO NOTHING;
