-- AAR-841 Step 1/3: claims-Spalten für Kanzlei-Wunsch (Hybrid-Onboarding)
--
-- 4 neue Spalten:
--   kanzlei_wunsch                  CHECK über 5 Werte, default 'nicht_gefragt'
--   kanzlei_wunsch_gefragt_am       Zeitstempel der Antwort
--   kanzlei_wunsch_gefragt_in_phase 'lead_konvertierung' | 'phase_4_re_frage'
--   kanzlei_wunsch_re_frage_pending GENERATED ALWAYS — true bei 'noch_unentschieden',
--                                    Index nutzt das für Cron-Effizienz

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS kanzlei_wunsch                  TEXT NOT NULL DEFAULT 'nicht_gefragt',
  ADD COLUMN IF NOT EXISTS kanzlei_wunsch_gefragt_am       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kanzlei_wunsch_gefragt_in_phase TEXT;

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_kanzlei_wunsch_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_kanzlei_wunsch_check CHECK (
  kanzlei_wunsch = ANY (ARRAY[
    'partnerkanzlei',
    'eigene_kanzlei',
    'keine_kanzlei',
    'noch_unentschieden',
    'nicht_gefragt'
  ])
);

ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_kanzlei_gefragt_in_phase_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_kanzlei_gefragt_in_phase_check CHECK (
  kanzlei_wunsch_gefragt_in_phase IS NULL OR kanzlei_wunsch_gefragt_in_phase = ANY (ARRAY[
    'lead_konvertierung',
    'phase_4_re_frage'
  ])
);

-- Index für Re-Frage-Cron (sucht Claims in Phase 4+ mit unentschiedenem Wunsch)
CREATE INDEX IF NOT EXISTS idx_claims_kanzlei_re_frage
  ON public.claims(phase)
  WHERE kanzlei_wunsch = 'noch_unentschieden'
    AND phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung');

COMMENT ON COLUMN public.claims.kanzlei_wunsch IS
  'AAR-841: Onboarding-Antwort des Kunden zur Kanzlei-Frage. '
  'partnerkanzlei = LexDrive einbinden. eigene_kanzlei = Kunde nennt Anwalt. '
  'keine_kanzlei = ohne. noch_unentschieden = Re-Frage nach Phase 4. '
  'nicht_gefragt = noch keine Antwort (Default).';
