-- AAR-824: claim_mietwagen — Mietwagen-Anspruch als Sub-Asset des Claims
--
-- Keine eigene Phase-Kopplung (Phase läuft über Gutachten/Repairs/Payments).
-- Wird für Schadensabrechnung und Mietwagen-Koordination genutzt.

CREATE TABLE IF NOT EXISTS public.claim_mietwagen (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,

  -- Lifecycle
  status                  TEXT NOT NULL DEFAULT 'beantragt' CHECK (status IN (
                             'beantragt','genehmigt','aktiv','beendet','abgelehnt','storniert'
                           )),

  -- Mietwagen-Details
  fahrzeugklasse          TEXT,  -- z.B. 'Klasse 4', 'Kompakt'
  anbieter                TEXT,
  mietvertrag_nr          TEXT,

  -- Termine
  beginn_datum            DATE,
  ende_datum              DATE,
  tatsaechliches_ende     DATE,

  -- Kostenberechnung
  tagespreis_netto        NUMERIC(8,2),
  tage_gesamt             INTEGER GENERATED ALWAYS AS (
                             CASE
                               WHEN tatsaechliches_ende IS NOT NULL AND beginn_datum IS NOT NULL
                               THEN (tatsaechliches_ende - beginn_datum)::INTEGER
                               WHEN ende_datum IS NOT NULL AND beginn_datum IS NOT NULL
                               THEN (ende_datum - beginn_datum)::INTEGER
                               ELSE NULL
                             END
                           ) STORED,
  gesamtkosten_netto      NUMERIC(10,2),

  -- Kostenerstattung
  erstattet_durch_vs      BOOLEAN DEFAULT false,
  erstattungsbetrag       NUMERIC(10,2),
  erstattung_am           DATE,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_cm_claim  ON public.claim_mietwagen(claim_id);
CREATE INDEX IF NOT EXISTS idx_cm_status ON public.claim_mietwagen(status) WHERE status NOT IN ('beendet','storniert','abgelehnt');

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_claim_mietwagen_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cm_updated_at ON public.claim_mietwagen;
CREATE TRIGGER trg_cm_updated_at
  BEFORE UPDATE ON public.claim_mietwagen
  FOR EACH ROW EXECUTE FUNCTION public.set_claim_mietwagen_updated_at();

-- RLS
ALTER TABLE public.claim_mietwagen ENABLE ROW LEVEL SECURITY;

CREATE POLICY cm_admin_all ON public.claim_mietwagen FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY cm_kb_own ON public.claim_mietwagen FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = claim_mietwagen.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = claim_mietwagen.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);
-- Kunde darf eigenen Mietwagen-Status lesen
CREATE POLICY cm_kunde_select ON public.claim_mietwagen FOR SELECT USING (
  claim_id IN (
    SELECT f.claim_id FROM public.faelle f
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE f.kunde_id = auth.uid() AND p.rolle = 'kunde'
  )
);

COMMENT ON TABLE public.claim_mietwagen IS
  'AAR-824: Mietwagen-Anspruch pro Claim. '
  'tage_gesamt + gesamtkosten_netto für Schadensabrechnung. '
  'Keine eigene Phase-Kopplung — Phase läuft über Gutachten/Repairs/Payments.';
