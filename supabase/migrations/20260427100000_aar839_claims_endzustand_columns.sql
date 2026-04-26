-- AAR-839 Step 1/8: Neue Endzustand-Spalten auf claims
--
-- Diese Spalten werden später durch markClaimAsReguliert/Abgelehnt/Storniert/
-- AnExterneKanzlei (AAR-840) gepflegt. Müssen vor dem Backfill existieren,
-- weil das Backfill verjaehrt → abgelehnt + vs_ablehnungs_grund='verjaehrung'
-- mappt.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS vs_ablehnungs_grund                TEXT,
  ADD COLUMN IF NOT EXISTS regulierungs_betrag                NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS endzustand_gesetzt_durch_user_id   UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS endzustand_gesetzt_am              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS endzustand_grund                   TEXT;

COMMENT ON COLUMN public.claims.vs_ablehnungs_grund IS
  'AAR-839: Bei status=abgelehnt — z.B. verjaehrung, vs_lehnt_ab, kein_versicherungsschutz, kunde_storniert';
COMMENT ON COLUMN public.claims.regulierungs_betrag IS
  'AAR-839: Bei status=reguliert — Gesamt-Regulierungsbetrag in EUR (Detail in claim_payments)';
COMMENT ON COLUMN public.claims.endzustand_gesetzt_durch_user_id IS
  'AAR-839: Audit — welcher User hat den manuellen Endzustand gesetzt (KB/Admin)';
COMMENT ON COLUMN public.claims.endzustand_gesetzt_am IS
  'AAR-839: Audit — Zeitstempel des manuellen Endzustand-Wechsels';
COMMENT ON COLUMN public.claims.endzustand_grund IS
  'AAR-839: Frei-Text-Begründung für Audit, immer pflicht beim manuellen Endzustand';
