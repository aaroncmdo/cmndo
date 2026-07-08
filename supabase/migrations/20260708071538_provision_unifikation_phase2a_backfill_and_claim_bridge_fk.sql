-- Phase 2a: Bestand (9 Test-Rows) old -> partner_provisionen backfillen (upsert-safe: bei Re-Run
-- synct es Lifecycle-Felder falls die Row schon per Dual-Write existiert) + claim_id -> bridge-FK
-- fuer die 3 makler-Portal-Embeds. Additiv/safe; Reader flippen erst spaeter in Phase 2.

-- (1) Backfill makler-Provisionen
INSERT INTO public.partner_provisionen
  (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, service_typ, abrechnung_id,
   betrag_netto_eur, ust_satz, ust_betrag, betrag_brutto, trigger_event, trigger_at, hold_until,
   status, storniert_am, storno_grund, erstellt_am)
SELECT 'makler', makler_id, claim_id, fall_id, lead_id, promotion_code_id, service_typ, abrechnung_id,
   betrag_netto_eur, ust_satz, ust_betrag, betrag_brutto, trigger_event, trigger_at, hold_until,
   status, storniert_am, storno_grund, erstellt_am
FROM public.makler_provisionen
ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO UPDATE SET
  status = EXCLUDED.status, storniert_am = EXCLUDED.storniert_am, storno_grund = EXCLUDED.storno_grund,
  abrechnung_id = EXCLUDED.abrechnung_id, ust_satz = EXCLUDED.ust_satz, ust_betrag = EXCLUDED.ust_betrag,
  betrag_brutto = EXCLUDED.betrag_brutto;

-- (2) Backfill werkstatt-Provisionen
INSERT INTO public.partner_provisionen
  (partner_typ, partner_id, claim_id, fall_id, claim_nummer, ausgezahlt_am,
   betrag_netto_eur, ust_satz, ust_betrag, betrag_brutto, trigger_event, trigger_at, hold_until,
   status, storniert_am, storno_grund, erstellt_am)
SELECT 'werkstatt', werkstatt_id, claim_id, fall_id, claim_nummer, ausgezahlt_am,
   betrag_netto_eur, ust_satz, ust_betrag, betrag_brutto, trigger_event, trigger_at, hold_until,
   status, storniert_am, storno_grund, erstellt_am
FROM public.werkstatt_provisionen
ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO UPDATE SET
  status = EXCLUDED.status, ausgezahlt_am = EXCLUDED.ausgezahlt_am, storniert_am = EXCLUDED.storniert_am,
  storno_grund = EXCLUDED.storno_grund, ust_satz = EXCLUDED.ust_satz, ust_betrag = EXCLUDED.ust_betrag,
  betrag_brutto = EXCLUDED.betrag_brutto;

-- (3) claim_id -> faelle_claim_bridge(claim_id)-FK (fuer PostgREST-Embeds der makler-Reader).
-- NICHT fall_id (waere werkstatt-Claim-Insert-Breaker). bridge.claim_id UNIQUE + fuer jeden Claim
-- gesetzt (sync_claims_to_bridge, prod 30/30). Trigger-Order sync < werkstatt -> FK bei Insert erfuellt.
ALTER TABLE public.partner_provisionen
  ADD CONSTRAINT partner_provisionen_claim_bridge_fkey
  FOREIGN KEY (claim_id) REFERENCES public.faelle_claim_bridge (claim_id) NOT VALID;
