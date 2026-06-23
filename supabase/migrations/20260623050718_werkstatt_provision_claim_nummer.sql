-- Schaden-Nr (claim_nummer) auf werkstatt_provisionen denormalisieren, damit das
-- Werkstatt-Portal sie RLS-sicher direkt liest (claims hat keine werkstatt-RLS-Policy
-- -> der eingebettete claim-Join im Portal lieferte null = leere Schaden-Nr).
-- claim_nummer ist immutable (set_claim_nummer BEFORE INSERT) -> kein Sync-Problem.
ALTER TABLE public.werkstatt_provisionen ADD COLUMN IF NOT EXISTS claim_nummer text;

-- Trigger: claim_nummer beim Anlegen mitschreiben (NEW.claim_nummer ist im AFTER-INSERT
-- bereits gesetzt vom BEFORE-INSERT set_claim_nummer).
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  RETURN NEW;
END; $$;

-- Backfill bestehender Provisionen.
UPDATE public.werkstatt_provisionen wp
SET claim_nummer = c.claim_nummer
FROM public.claims c
WHERE c.id = wp.claim_id AND wp.claim_nummer IS NULL;
