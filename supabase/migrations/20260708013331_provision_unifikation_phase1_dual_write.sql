-- Provisions-Unifikation Phase 1 (DUAL-WRITE, verhaltensneutral). Design:
-- docs/superpowers/plans/2026-07-08-provision-ledger-unifikation-phase1-detail.md
-- Die Provisions-Trigger schreiben ab jetzt ZUSAETZLICH in partner_provisionen (partner_typ).
-- Alt-Tabellen bleiben fuehrend (Reader/Staffel-Trigger/Cron UNBERUEHRT) -> Phase 1 ist entkoppelt
-- von Phase 2 und allein deploybar. Phase 2 zieht Reader/Mutationen/Staffel um; Phase 3 stoppt den
-- Dual-Write + backfillt + droppt Alt. RLS-sicher: Trigger laufen SECURITY DEFINER als postgres
-- (bypassrls=true), partner_provisionen.force_rls=false.

-- Partieller Unique-Index fuer die ON-CONFLICT-Idempotenz der partner_provisionen-Inserts
-- (pro (partner_typ, claim_id) genau eine Provision; makler+werkstatt kollidieren NICHT).
CREATE UNIQUE INDEX IF NOT EXISTS partner_provisionen_typ_claim_uniq
  ON public.partner_provisionen (partner_typ, claim_id) WHERE claim_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- DUAL-WRITE (Unifikation Phase 1): Spiegel in partner_provisionen (partner_typ='makler').
  -- makler_provisionen oben bleibt fuehrend bis Phase 2 -> verhaltensneutral.
  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    ('makler', v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo, v_betrag, v_service,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  INSERT INTO public.werkstatt_provisionen
    (werkstatt_id, claim_id, fall_id, betrag_netto_eur, trigger_event, trigger_at, hold_until, status, claim_nummer)
  VALUES
    (NEW.werkstatt_id, NEW.id, NEW.id, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending', NEW.claim_nummer)
  ON CONFLICT (claim_id) DO NOTHING;

  -- DUAL-WRITE (Unifikation Phase 1): Spiegel in partner_provisionen (partner_typ='werkstatt').
  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('werkstatt', NEW.werkstatt_id, NEW.id, NEW.id, NEW.claim_nummer, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;
