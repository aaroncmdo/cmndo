-- CMM-37 Phase 1: kanzlei_faelle direkt am Claim verankern.
--
-- Begruendung: der Kanzleifall ist konzeptionell eine Phase des
-- Schadensvorgangs (claim), nicht einer einzelnen Akte (fall). Heute
-- ist faelle:claims bereits 1:1, sobald der finale Cleanup durch ist
-- ist es das ohnehin offiziell. Der direkte FK auf claims macht den
-- Lifecycle-Resolver flacher (eine Bubble-Stufe weniger) und macht
-- den Loader-Pfad fuer SV/Admin geradeaus.
--
-- Strategie:
--   1. claim_id als nullable Spalte hinzufuegen
--   2. Backfill aus fall_id → faelle.claim_id
--   3. UNIQUE-Constraint auf claim_id (ein Kanzleifall pro Claim)
--   4. Sync-Trigger BEFORE INSERT/UPDATE haelt claim_id und fall_id
--      konsistent waehrend der Uebergangsphase. Schreibt der Caller
--      nur fall_id, wird claim_id automatisch befuellt.
--   5. NOT NULL auf claim_id (alle Bestandseintraege haben einen
--      Claim, Backfill garantiert das).
--
-- fall_id bleibt vorerst NOT NULL — Phase 4 entscheidet ueber Drop.

-- 1. Spalte
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE;

-- 2. Backfill
UPDATE public.kanzlei_faelle kf
SET claim_id = f.claim_id
FROM public.faelle f
WHERE kf.fall_id = f.id
  AND kf.claim_id IS NULL
  AND f.claim_id IS NOT NULL;

-- Sanity-Check: jede kanzlei_faelle-Zeile hat jetzt einen claim_id.
DO $$
DECLARE
  fehlend int;
BEGIN
  SELECT count(*) INTO fehlend FROM public.kanzlei_faelle WHERE claim_id IS NULL;
  IF fehlend > 0 THEN
    RAISE EXCEPTION 'CMM-37: Backfill unvollstaendig — % Zeilen ohne claim_id', fehlend;
  END IF;
END $$;

-- 3. UNIQUE — ein Regulierungsvorgang pro Claim
ALTER TABLE public.kanzlei_faelle
  ADD CONSTRAINT kanzlei_faelle_claim_id_unique UNIQUE (claim_id);

-- 4. Sync-Trigger fuer Uebergangsphase
CREATE OR REPLACE FUNCTION public.kanzlei_faelle_sync_claim_fall()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Wenn nur fall_id gesetzt: claim_id daraus ableiten.
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id FROM public.faelle WHERE id = NEW.fall_id;
  END IF;
  -- Wenn nur claim_id gesetzt: fall_id daraus ableiten (gewinnt der
  -- erste passende Fall — bei 1:1 eindeutig).
  IF NEW.fall_id IS NULL AND NEW.claim_id IS NOT NULL THEN
    SELECT id INTO NEW.fall_id FROM public.faelle WHERE claim_id = NEW.claim_id LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kanzlei_faelle_sync ON public.kanzlei_faelle;
CREATE TRIGGER trg_kanzlei_faelle_sync
  BEFORE INSERT OR UPDATE OF fall_id, claim_id ON public.kanzlei_faelle
  FOR EACH ROW EXECUTE FUNCTION public.kanzlei_faelle_sync_claim_fall();

-- 5. NOT NULL
ALTER TABLE public.kanzlei_faelle
  ALTER COLUMN claim_id SET NOT NULL;

-- 6. Index + Comment
CREATE INDEX IF NOT EXISTS idx_kanzlei_faelle_claim ON public.kanzlei_faelle(claim_id);

COMMENT ON COLUMN public.kanzlei_faelle.claim_id IS
  'CMM-37: Direkter FK auf claims. Ist seit Phase 1 die kanonische '
  'Beziehung; fall_id bleibt waehrend der Uebergangsphase parallel '
  'gepflegt (Sync-Trigger). Phase 4 entscheidet ueber Drop von fall_id.';
COMMENT ON CONSTRAINT kanzlei_faelle_claim_id_unique ON public.kanzlei_faelle IS
  'Genau ein Kanzleifall pro Claim — der Regulierungsvorgang gehoert '
  'dem ganzen Schadensvorgang, nicht einer einzelnen Akte.';
