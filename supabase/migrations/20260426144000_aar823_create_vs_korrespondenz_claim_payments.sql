-- AAR-823: vs_korrespondenz + claim_payments — VS-Kommunikation + Zahlungseingang
--
-- Phase-Kopplung (calc_claims_phase in AAR-830):
--   claim_payments.status = 'erhalten'  → claim.phase = '7_zahlung_erhalten'
--   claim_payments.status = 'final'     → claim.phase = '8_abgeschlossen'

-- ─── VS-Korrespondenz ────────────────────────────────────────────────────────
-- Eingehende und ausgehende Kommunikation mit der Versicherung des Gegners.

CREATE TABLE IF NOT EXISTS public.vs_korrespondenz (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Richtung & Typ
  richtung        TEXT NOT NULL CHECK (richtung IN ('eingehend','ausgehend')),
  kanal           TEXT NOT NULL CHECK (kanal IN ('email','post','fax','telefon','portal')),
  betreff         TEXT,

  -- Versicherungs-Referenz
  versicherung    TEXT,  -- Name der Versicherung des Gegners
  aktenzeichen    TEXT,  -- Aktenzeichen bei der Versicherung

  -- Inhalt / Datei
  notiz           TEXT,
  attachment_url  TEXT,

  -- Termine
  datum           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vsk_claim  ON public.vs_korrespondenz(claim_id);
CREATE INDEX IF NOT EXISTS idx_vsk_datum  ON public.vs_korrespondenz(datum);

-- RLS
ALTER TABLE public.vs_korrespondenz ENABLE ROW LEVEL SECURITY;

CREATE POLICY vsk_admin_all ON public.vs_korrespondenz FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY vsk_kb_own ON public.vs_korrespondenz FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = vs_korrespondenz.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = vs_korrespondenz.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);

-- ─── Claim-Zahlungen ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.claim_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'ausstehend' CHECK (status IN (
                         'ausstehend','teilweise','erhalten','final','abgelehnt'
                       )),

  -- Beträge
  forderungsbetrag    NUMERIC(12,2),
  erhaltener_betrag   NUMERIC(12,2),
  differenz_betrag    NUMERIC(12,2) GENERATED ALWAYS AS (
                         COALESCE(forderungsbetrag, 0) - COALESCE(erhaltener_betrag, 0)
                       ) STORED,

  -- Zahlungs-Details
  zahlungseingang_am  TIMESTAMPTZ,
  zahlungsweg         TEXT CHECK (zahlungsweg IN ('überweisung','scheck','bar','verrechnung')),
  zahlungsreferenz    TEXT,

  -- Regulierungs-Notiz
  notiz               TEXT,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cp_claim  ON public.claim_payments(claim_id);
CREATE INDEX IF NOT EXISTS idx_cp_status ON public.claim_payments(status) WHERE status NOT IN ('abgelehnt','final');

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_claim_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cp_updated_at ON public.claim_payments;
CREATE TRIGGER trg_cp_updated_at
  BEFORE UPDATE ON public.claim_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_claim_payments_updated_at();

-- ─── Phase-Refresh-Trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_refresh_claim_phase_from_payments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_claim_id UUID;
BEGIN
  v_claim_id := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.claim_id ELSE NEW.claim_id END,
    NULL
  );
  IF v_claim_id IS NOT NULL THEN
    UPDATE public.claims
       SET phase = public.calc_claims_phase(id, status, kundenbetreuer_id)
     WHERE id = v_claim_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cp_refresh_phase ON public.claim_payments;
CREATE TRIGGER trg_cp_refresh_phase
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.claim_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_refresh_claim_phase_from_payments();

-- RLS
ALTER TABLE public.claim_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_admin_all ON public.claim_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY cp_kb_own ON public.claim_payments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = claim_payments.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = claim_payments.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);

COMMENT ON TABLE public.vs_korrespondenz IS
  'AAR-823: VS-Kommunikation (ein- und ausgehend) pro Claim. '
  'Kanäle: email/post/fax/telefon/portal. Aktenzeichen der Gegner-Versicherung.';
COMMENT ON TABLE public.claim_payments IS
  'AAR-823: Zahlungseingang vom Versicherer. '
  'status=erhalten → Phase 7_zahlung_erhalten, status=final → 8_abgeschlossen. '
  'differenz_betrag GENERATED ALWAYS (Forderung minus Erhalten).';
