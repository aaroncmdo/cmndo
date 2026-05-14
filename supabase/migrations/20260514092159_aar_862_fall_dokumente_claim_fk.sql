-- AAR-862 — Storage-Reorg Phase 1: fall_dokumente.claim_id FK + Backfill + Sync-Trigger
--
-- Schritt 1 von Aaron-Spec: Direkte FK von fall_dokumente auf claims, damit Multi-Portal-
-- Sicht (Kunde/SV/KB/Admin/Kanzlei) auf den einen Claim-Ordner zugreifen kann ohne
-- Indirektion über faelle.claim_id.
--
-- Pre-Apply-Stand (verifiziert): 11 Faelle, 11 Claims, 100% claim_id-Coverage in faelle.
-- fall_dokumente hat 1 aktive Row → Backfill trivial.
-- Existierender Trigger: fall_dokumente_autotask (AFTER INSERT) → keine Kollision mit
-- BEFORE INSERT/UPDATE-Trigger.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Spalte ergänzen (nullable, damit Backfill funktioniert)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.fall_dokumente
  ADD COLUMN claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill aus faelle.claim_id
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.fall_dokumente fd
SET claim_id = f.claim_id
FROM public.faelle f
WHERE fd.fall_id = f.id
  AND fd.claim_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. NOT NULL (alle Bestands-Rows haben jetzt claim_id, neue auch via Trigger)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.fall_dokumente
  ALTER COLUMN claim_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fall_dokumente_claim_id
  ON public.fall_dokumente(claim_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Sync-Trigger: bei INSERT/UPDATE claim_id automatisch aus faelle ziehen
--    falls Caller nur fall_id setzt (Backward-Compatibility).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_fall_dokumente_claim_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
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

DROP TRIGGER IF EXISTS fall_dokumente_sync_claim_id ON public.fall_dokumente;
CREATE TRIGGER fall_dokumente_sync_claim_id
  BEFORE INSERT OR UPDATE OF fall_id ON public.fall_dokumente
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fall_dokumente_claim_id();

COMMENT ON COLUMN public.fall_dokumente.claim_id IS
  'Direkte FK auf claims(id) für claim-zentrierte Storage-Pfade (AAR-862). Wird automatisch via Trigger aus faelle.claim_id gesetzt, wenn Caller nur fall_id übergibt.';
