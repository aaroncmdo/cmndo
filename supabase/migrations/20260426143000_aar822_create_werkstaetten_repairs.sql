-- AAR-822: werkstaetten (Stub) + repairs — Reparaturauftrag als Sub-Asset des Claims
--
-- Phase-Kopplung (calc_claims_phase in AAR-830):
--   repairs.status IN ('geplant','in_arbeit') → claim.phase = '5_reparatur_laeuft'
--   repairs.status = 'abgeschlossen'           → claim.phase = '6_reparatur_fertig'

-- ─── Werkstätten-Stub ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.werkstaetten (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  adresse_strasse TEXT,
  adresse_plz     TEXT,
  adresse_ort     TEXT,
  telefon         TEXT,
  email           TEXT,
  website         TEXT,
  partner         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at
CREATE OR REPLACE FUNCTION public.set_werkstaetten_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_werkstaetten_updated_at ON public.werkstaetten;
CREATE TRIGGER trg_werkstaetten_updated_at
  BEFORE UPDATE ON public.werkstaetten
  FOR EACH ROW EXECUTE FUNCTION public.set_werkstaetten_updated_at();

-- RLS — nur Admin schreibt, alle internen Rollen lesen
ALTER TABLE public.werkstaetten ENABLE ROW LEVEL SECURITY;

CREATE POLICY werkstaetten_admin_all ON public.werkstaetten FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY werkstaetten_staff_select ON public.werkstaetten FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND rolle IN ('admin','kundenbetreuer','sachverstaendiger','dispatch')
  )
);

-- ─── Repairs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repairs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id              UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  werkstatt_id          UUID REFERENCES public.werkstaetten(id) ON DELETE SET NULL,

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'geplant' CHECK (status IN (
                           'geplant','in_arbeit','abgeschlossen','storniert'
                         )),
  auftragsnummer        TEXT,

  -- Termine
  geplanter_beginn      TIMESTAMPTZ,
  tatsaechlicher_beginn TIMESTAMPTZ,
  abgeschlossen_am      TIMESTAMPTZ,

  -- Kostenverfolgung
  kostenvoranschlag     NUMERIC(12,2),
  tatsaechliche_kosten  NUMERIC(12,2),

  -- Gutachten-Bezug (optional)
  gutachten_id          UUID REFERENCES public.gutachten(id) ON DELETE SET NULL,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_repairs_claim    ON public.repairs(claim_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status   ON public.repairs(status) WHERE status != 'storniert';
CREATE INDEX IF NOT EXISTS idx_repairs_werkstatt ON public.repairs(werkstatt_id);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_repairs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_repairs_updated_at ON public.repairs;
CREATE TRIGGER trg_repairs_updated_at
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.set_repairs_updated_at();

-- ─── Phase-Refresh-Trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_refresh_claim_phase_from_repairs()
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

DROP TRIGGER IF EXISTS trg_repairs_refresh_phase ON public.repairs;
CREATE TRIGGER trg_repairs_refresh_phase
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_refresh_claim_phase_from_repairs();

-- RLS
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY repairs_admin_all ON public.repairs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY repairs_kb_own ON public.repairs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = repairs.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = repairs.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);

COMMENT ON TABLE public.werkstaetten IS
  'AAR-822: Werkstätten-Stub. Vorerst manuell gepflegt, später Partner-Verzeichnis.';
COMMENT ON TABLE public.repairs IS
  'AAR-822: Reparaturauftrag als Sub-Asset des Claims. '
  'Status geplant/in_arbeit → Phase 5_reparatur_laeuft, abgeschlossen → 6_reparatur_fertig. '
  'Kostenverfolgung Soll (kostenvoranschlag) vs. Ist (tatsaechliche_kosten).';
