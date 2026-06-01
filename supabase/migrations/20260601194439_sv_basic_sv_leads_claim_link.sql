-- SV Basic-Tier P0: sv_leads Claim-Verlinkung (Kalt-Pin -> Account).
-- Additiv, 0 Daten betroffen. Spalten/Constraint via Plugin appliziert
-- (recorded version 20260601194439). Consumer kommen in P1 (Claim-Flow).

ALTER TABLE public.sv_leads
  ADD COLUMN IF NOT EXISTS konvertiert_zu_sv_id uuid REFERENCES public.sachverstaendige(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS konvertiert_am timestamptz,
  ADD COLUMN IF NOT EXISTS claim_status text NOT NULL DEFAULT 'offen';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sv_leads_claim_status_check') THEN
    ALTER TABLE public.sv_leads
      ADD CONSTRAINT sv_leads_claim_status_check
      CHECK (claim_status IN ('offen','beansprucht_pending','konvertiert'));
  END IF;
END $$;

COMMENT ON COLUMN public.sv_leads.konvertiert_zu_sv_id IS 'GMB-Claim (P1): verlinkt den Kalt-Pin auf den entstandenen sachverstaendige-Account.';
COMMENT ON COLUMN public.sv_leads.konvertiert_am IS 'Zeitpunkt des Claims/der Konvertierung (P1).';
COMMENT ON COLUMN public.sv_leads.claim_status IS 'offen=frei beanspruchbar | beansprucht_pending=Account angelegt, Verifizierung offen | konvertiert=live (P1).';
