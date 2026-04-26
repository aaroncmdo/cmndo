-- AAR-819: gutachten_positionen — Schadenspositionen innerhalb eines Gutachtens
--
-- Keine direkte Phase-Kopplung (Phase läuft über gutachten.status → AAR-818 Trigger).
-- Summen-Aggregation auf Applikationsebene (oder Supabase-View wenn nötig).

CREATE TABLE IF NOT EXISTS public.gutachten_positionen (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gutachten_id        UUID NOT NULL REFERENCES public.gutachten(id) ON DELETE CASCADE,
  claim_id            UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Position
  position_nr         INTEGER NOT NULL,
  bezeichnung         TEXT NOT NULL,
  kategorie           TEXT CHECK (kategorie IN (
                        'karosserie','lack','mechanik','glas','interieur',
                        'elektrik','sonstiges'
                      )),

  -- Beträge
  schadensbetrag_netto  NUMERIC(10,2),
  schadensbetrag_brutto NUMERIC(10,2),
  mwst_satz             NUMERIC(5,2) DEFAULT 19.00,

  -- Reparatur-Empfehlung
  reparaturart          TEXT CHECK (reparaturart IN (
                           'instandsetzung','ersatz','lackierung','keine'
                         )),
  ersatzteil_nr         TEXT,
  arbeitszeit_aw        NUMERIC(6,2),

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_gutachten ON public.gutachten_positionen(gutachten_id);
CREATE INDEX IF NOT EXISTS idx_gp_claim     ON public.gutachten_positionen(claim_id);

-- Eindeutige Positions-Nummer pro Gutachten
ALTER TABLE public.gutachten_positionen
  ADD CONSTRAINT uq_gutachten_position_nr UNIQUE (gutachten_id, position_nr);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_gutachten_positionen_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_gp_updated_at ON public.gutachten_positionen;
CREATE TRIGGER trg_gp_updated_at
  BEFORE UPDATE ON public.gutachten_positionen
  FOR EACH ROW EXECUTE FUNCTION public.set_gutachten_positionen_updated_at();

-- RLS
ALTER TABLE public.gutachten_positionen ENABLE ROW LEVEL SECURITY;

CREATE POLICY gp_admin_all ON public.gutachten_positionen FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY gp_kb_own ON public.gutachten_positionen FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten_positionen.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten_positionen.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);
CREATE POLICY gp_sv_own ON public.gutachten_positionen FOR ALL USING (
  gutachten_id IN (
    SELECT g.id FROM public.gutachten g
    JOIN public.sachverstaendige sv ON sv.id = g.sv_id
    WHERE sv.profile_id = auth.uid()
  )
) WITH CHECK (
  gutachten_id IN (
    SELECT g.id FROM public.gutachten g
    JOIN public.sachverstaendige sv ON sv.id = g.sv_id
    WHERE sv.profile_id = auth.uid()
  )
);

COMMENT ON TABLE public.gutachten_positionen IS
  'AAR-819: Einzelne Schadenspositionen eines Gutachtens. '
  'Phase-Kopplung läuft über gutachten.status (AAR-818). '
  'position_nr eindeutig je Gutachten.';
