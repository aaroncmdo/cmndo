-- Phase 3bc: Dual-Write stoppen (Trigger schreiben nur noch partner_provisionen) + die 4 Alt-Tabellen
-- droppen. ATOMAR: schlaegt der DROP fehl, rollt auch der Trigger-Rewrite zurueck (Dual-Write bleibt).
-- Vorbedingung erfuellt: 0 App-Reader (main + VPS deployed via #3951), 0 weitere DB-Referenzen,
-- Parity prod-verifiziert (union >= old, 0 missing).

-- 3b: create_makler_provision — OLD-Insert (makler_provisionen) raus; makler_fall_consent-Insert
--     (Sichtbarkeit != Provision) + partner_provisionen-Insert + SET search_path BLEIBEN.
CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
BEGIN
  SELECT makler_id, service_typ, lead_id INTO v_makler, v_service, v_lead
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

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
  RETURN NEW;
END; $function$;

-- 3b: create_werkstatt_provision — OLD-Insert (werkstatt_provisionen) raus; partner_provisionen-Insert bleibt.
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
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

-- 3c: DROP der 4 Alt-Tabellen. Kein CASCADE — Trigger (trg_derive_claim_id auf makler_provisionen),
--     tabellen-eigene RLS-Policies + Indizes droppen automatisch mit; ein UNERWARTETER Dependent
--     soll den Drop LAUT failen lassen (statt still wegzucascaden).
DROP TABLE IF EXISTS public.makler_provisionen;
DROP TABLE IF EXISTS public.werkstatt_provisionen;
DROP TABLE IF EXISTS public.makler_staffel_bonus;
DROP TABLE IF EXISTS public.werkstatt_staffel_bonus;
