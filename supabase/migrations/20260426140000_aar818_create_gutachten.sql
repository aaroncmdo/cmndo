-- AAR-818: gutachten — Sachverständigen-Begutachtung als Sub-Asset des Claims
--
-- Phase-Kopplung (calc_claims_phase in AAR-830):
--   status IN ('beauftragt','besichtigt','in_erstellung') → claim.phase = '3_gutachter_unterwegs'
--   status = 'final'                                      → claim.phase = '4_gutachten_fertig'
--
-- Phase-Update-Muster für alle Sub-Assets (dieses Muster wiederholen in 819/821/822/823/824):
--   AFTER INSERT/UPDATE/DELETE → direkt UPDATE claims SET phase = calc_claims_phase(...)

CREATE TABLE IF NOT EXISTS public.gutachten (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id              UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  sv_id                 UUID NOT NULL REFERENCES public.sachverstaendige(id) ON DELETE RESTRICT,

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'beauftragt' CHECK (status IN (
                          'beauftragt','besichtigt','in_erstellung','final','storniert'
                        )),
  auftragsnummer        TEXT UNIQUE,

  -- Termine
  besichtigungstermin   TIMESTAMPTZ,
  besichtigt_am         TIMESTAMPTZ,
  fertiggestellt_am     TIMESTAMPTZ,
  unterschrieben_am     TIMESTAMPTZ,

  -- Ergebnis
  gesamt_schadensbetrag NUMERIC(12,2),
  unterschrift_sv_url   TEXT,
  bericht_pdf_url       TEXT,

  -- Läufer-Report-Referenz (wenn Org-Modell, AAR-832)
  laeufer_report_id     UUID REFERENCES public.sv_organisation_laeufer_reports(id) ON DELETE SET NULL,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_gutachten_claim  ON public.gutachten(claim_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_sv     ON public.gutachten(sv_id);
CREATE INDEX IF NOT EXISTS idx_gutachten_status ON public.gutachten(status) WHERE status != 'storniert';

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_gutachten_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_gutachten_updated_at ON public.gutachten;
CREATE TRIGGER trg_gutachten_updated_at
  BEFORE UPDATE ON public.gutachten
  FOR EACH ROW EXECUTE FUNCTION public.set_gutachten_updated_at();

-- ─── Phase-Refresh-Trigger ────────────────────────────────────────────────────
-- Nach jeder Statusänderung eines Gutachtens claims.phase neu berechnen.
-- Direkte UPDATE statt über updated_at-Hop, weil trg_claims_set_phase
-- nur auf UPDATE OF status,kundenbetreuer_id feuert.

CREATE OR REPLACE FUNCTION public.trg_fn_refresh_claim_phase_from_gutachten()
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

DROP TRIGGER IF EXISTS trg_gutachten_refresh_phase ON public.gutachten;
CREATE TRIGGER trg_gutachten_refresh_phase
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.gutachten
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_refresh_claim_phase_from_gutachten();

-- RLS
ALTER TABLE public.gutachten ENABLE ROW LEVEL SECURITY;

CREATE POLICY gutachten_admin_all ON public.gutachten FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle = 'admin')
);
CREATE POLICY gutachten_kb_own ON public.gutachten FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = gutachten.claim_id AND p.rolle = 'kundenbetreuer'
      AND c.kundenbetreuer_id = auth.uid()
  )
);
CREATE POLICY gutachten_sv_own ON public.gutachten FOR ALL USING (
  sv_id IN (
    SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
  )
) WITH CHECK (
  sv_id IN (
    SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
  )
);
-- Büro-Admin sieht Gutachten der Büro-Mitglieder
CREATE POLICY gutachten_buero_admin_select ON public.gutachten FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sv_buero_memberships m
    JOIN public.sachverstaendige sv ON sv.id = m.sv_id
    WHERE m.buero_id IN (
      SELECT m2.buero_id FROM public.sv_buero_memberships m2
      JOIN public.sachverstaendige sv2 ON sv2.id = m2.sv_id
      WHERE sv2.profile_id = auth.uid() AND m2.rolle = 'admin' AND m2.end_date IS NULL
    )
    AND m.sv_id = gutachten.sv_id AND m.end_date IS NULL
  )
);

COMMENT ON TABLE public.gutachten IS
  'AAR-818: Sachverständigen-Gutachten als Sub-Asset des Claims. '
  'Status-Änderungen triggern calc_claims_phase() → claims.phase aktualisiert. '
  'sv_id = unterzeichnender SV (Läufer-Berichte in sv_organisation_laeufer_reports).';
