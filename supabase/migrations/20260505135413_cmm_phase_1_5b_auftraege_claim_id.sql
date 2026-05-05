-- CMM Phase 1.5b (2026-05-05) — auftraege.claim_id FK + Backfill
--
-- Heute: auftraege.fall_id ist die einzige Brücke zum Claim. Wer den Claim
-- braucht, muss `auftraege → faelle.claim_id → claims` joinen — ein Hop
-- mehr und Reader müssen wissen dass faelle die Vermittlung macht.
--
-- Ziel: auftraege.claim_id als direkter FK zu claims, analog zu kanzlei_faelle
-- (CMM-37). Inserts werden über Trigger automatisch befüllt damit Caller den
-- Wert nicht selbst setzen müssen.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, Backfill mit IS DISTINCT FROM, Trigger
-- mit DROP IF EXISTS.

-- ─── Sektion 1: Spalte hinzufügen ────────────────────────────────────────
ALTER TABLE public.auftraege
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auftraege_claim_id ON public.auftraege(claim_id);

-- ─── Sektion 2: Backfill aus faelle.claim_id ─────────────────────────────
UPDATE public.auftraege a
SET claim_id = f.claim_id
FROM public.faelle f
WHERE a.fall_id = f.id
  AND f.claim_id IS NOT NULL
  AND a.claim_id IS DISTINCT FROM f.claim_id;

-- ─── Sektion 3: Auto-Sync-Trigger (analog kanzlei_faelle CMM-37) ─────────
-- Beim INSERT: wenn claim_id NULL ist, aus faelle.claim_id ziehen.
-- Beim UPDATE von fall_id: claim_id mitziehen.
CREATE OR REPLACE FUNCTION public.auftraege_sync_claim_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id
    FROM public.faelle
    WHERE id = NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auftraege_sync_claim_id ON public.auftraege;
CREATE TRIGGER trg_auftraege_sync_claim_id
BEFORE INSERT OR UPDATE OF fall_id ON public.auftraege
FOR EACH ROW
EXECUTE FUNCTION public.auftraege_sync_claim_id();

COMMENT ON FUNCTION public.auftraege_sync_claim_id() IS
  'CMM Phase 1.5b: füllt auftraege.claim_id aus faelle.claim_id wenn nicht explizit gesetzt. Caller können claim_id auch direkt mitgeben.';

-- ─── Sektion 4: NOT NULL-Constraint (nach Backfill-Verifikation) ─────────
-- Werden alle bestehenden Rows einen claim_id haben? Ja — alle Faelle haben
-- seit AAR-816 (20260426130000) eine claim_id NOT NULL, und auftraege.fall_id
-- ist bereits NOT NULL. Backfill muss daher 100% abdecken.
DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.auftraege WHERE claim_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill unvollständig: % auftraege haben claim_id IS NULL', null_count;
  END IF;
END $$;

ALTER TABLE public.auftraege
  ALTER COLUMN claim_id SET NOT NULL;

COMMENT ON COLUMN public.auftraege.claim_id IS
  'Direktverlinkung zum Claim (Phase 1.5b). Wird via Trigger aus faelle.claim_id befüllt wenn Caller es nicht selbst setzt.';
