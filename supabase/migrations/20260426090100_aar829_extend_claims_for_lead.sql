-- AAR-829: claims-Tabelle um Lead-Konversions-Felder + Kundenbetreuer erweitern

-- claim_nummer-Sequenz (CLM-{YYYY}-{NNNNN})
CREATE SEQUENCE IF NOT EXISTS claims_claim_nummer_seq;

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS claim_nummer      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS lead_id           UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kundenbetreuer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Trigger: claim_nummer automatisch setzen
CREATE OR REPLACE FUNCTION public.set_claim_nummer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claim_nummer IS NULL THEN
    NEW.claim_nummer := 'CLM-'
      || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('claims_claim_nummer_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_claims_claim_nummer ON public.claims;
CREATE TRIGGER trg_claims_claim_nummer
  BEFORE INSERT ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_claim_nummer();

-- Status-Constraint erweitern: Workflow-Werte hinzufügen
-- (Bestehende Werte bleiben für laufende Rows; Cleanup → AAR-825)
ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_status_check;

ALTER TABLE public.claims
  ADD CONSTRAINT claims_status_check CHECK (status IN (
    -- Workflow-Werte (AAR-829/830)
    'dispatch_done',
    'in_bearbeitung',
    'abgeschlossen',
    'storniert',
    -- Legacy-Werte aus AAR-811 Backfill (Cleanup → AAR-825)
    'offen',
    'reguliert_teilweise',
    'reguliert_vollstaendig',
    'abgelehnt',
    'verjaehrt'
  ));

-- Indizes (vor UPDATEs, sonst Pending-Trigger-Events-Fehler)
CREATE INDEX IF NOT EXISTS idx_claims_lead_id
  ON public.claims(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_kundenbetreuer
  ON public.claims(kundenbetreuer_id) WHERE kundenbetreuer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_status_dispatch
  ON public.claims(status) WHERE status = 'dispatch_done';

COMMENT ON COLUMN public.claims.claim_nummer IS
  'AAR-829: Human-readable Claim-ID (CLM-2026-00042). Auto-generiert via Trigger.';
COMMENT ON COLUMN public.claims.lead_id IS
  'AAR-829: FK auf leads.id — gesetzt wenn Claim aus Lead-Konversion entstand. NULL = direkt angelegt (KB-Tool, Cardentity, Airdrop).';
COMMENT ON COLUMN public.claims.kundenbetreuer_id IS
  'AAR-829/831: Zugewiesener Kundenbetreuer. NULL = Phase 1_neu (Pool, noch nicht übernommen).';
