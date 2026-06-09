-- CMM-49: claims.hat_vorschaeden ist fuer 4 Bestands-Claims NULL, wo faelle einen
-- (assessed) Wert haelt (claims<->faelle-Drift, 0 Conflicts). Backfill claims<-faelle
-- macht claims value-aequivalent zu faelle (SSoT-Nachzug) und entfernt den einzigen
-- nicht-Vehicle Repoint-Verlust beim v_claim_full-Umstieg der entity-gated Reader
-- (4 Rows: CLM-2026-00222/240/243/244, alle faelle.hat_vorschaeden=false).
-- Scoped + idempotent: nur NULL->Wert, eine Richtung (kein faelle-Write), via Bridge.
-- Trigger-safe: kein hat_vorschaeden-Sync-Trigger; nur trg_claims_updated_at bumpt updated_at.
UPDATE public.claims c
SET hat_vorschaeden = f.hat_vorschaeden
FROM public.faelle_claim_bridge b
JOIN public.faelle f ON f.id = b.fall_id
WHERE b.claim_id = c.id
  AND c.hat_vorschaeden IS NULL
  AND f.hat_vorschaeden IS NOT NULL;
