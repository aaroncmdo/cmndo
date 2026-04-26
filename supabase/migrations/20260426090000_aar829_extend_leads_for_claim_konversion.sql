-- AAR-829: leads-Tabelle um Claim-Konversions-Spalten erweitern
-- Bestehender lead_status-Enum bleibt unverändert (Cleanup → AAR-825).
-- Konversions-Signal: qualifizierungs_phase = 'konvertiert' (bereits im Enum).

-- Nummer-Sequenz für LEAD-{YYYY}-{NNNNN}
CREATE SEQUENCE IF NOT EXISTS leads_lead_nummer_seq;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_nummer TEXT UNIQUE;

-- Trigger: lead_nummer automatisch setzen
CREATE OR REPLACE FUNCTION public.set_lead_nummer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lead_nummer IS NULL THEN
    NEW.lead_nummer := 'LEAD-'
      || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('leads_lead_nummer_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_lead_nummer ON public.leads;
CREATE TRIGGER trg_leads_lead_nummer
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_nummer();

-- Konversions-Felder
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS konvertiert_zu_claim_id   UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS konvertiert_am             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS konvertiert_durch_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fehlende_felder_jsonb      JSONB;

-- Backfill: lead_nummer für bestehende Rows (ohne Duplikate)
UPDATE public.leads
   SET lead_nummer = 'LEAD-'
     || to_char(created_at, 'YYYY') || '-'
     || lpad(nextval('leads_lead_nummer_seq')::text, 5, '0')
 WHERE lead_nummer IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_leads_konvertiert_zu_claim
  ON public.leads(konvertiert_zu_claim_id)
  WHERE konvertiert_zu_claim_id IS NOT NULL;

COMMENT ON COLUMN public.leads.lead_nummer IS
  'AAR-829: Human-readable Lead-ID (LEAD-2026-00042). Auto-generiert via Trigger.';
COMMENT ON COLUMN public.leads.konvertiert_zu_claim_id IS
  'AAR-829: FK auf claims.id — gesetzt wenn Lead konvertiert wurde. NULL = noch kein Claim.';
COMMENT ON COLUMN public.leads.konvertiert_am IS
  'AAR-829: Zeitpunkt der Claim-Konversion. Wichtig für Konversions-Dauer-Tracking.';
COMMENT ON COLUMN public.leads.fehlende_felder_jsonb IS
  'AAR-829: Liste fehlender Pflicht-Felder bei unvollständigen Leads (für Dispatcher-Nacharbeit).';
