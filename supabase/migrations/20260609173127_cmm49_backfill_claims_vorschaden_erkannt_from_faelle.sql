-- CMM-49: claims.vorschaden_erkannt ist fuer 4 Bestands-Claims NULL, wo faelle einen
-- (assessed) Wert (false) haelt — claims<->faelle-Drift (0 Conflicts), analog
-- 20260609155535 (hat_vorschaeden). Plan 4 (#2566) sourced vorschaden_erkannt in
-- v_claim_full aus claims; dieser Backfill schliesst den letzten Flag-Repoint-Verlust
-- (dokumente.ts liest vorschaden_erkannt). Rows: CLM-2026-00222/240/243/244 (alle false).
-- Scoped + idempotent + eine Richtung. Trigger-safe (kein vorschaden_erkannt-Sync auf claims).
UPDATE public.claims c
SET vorschaden_erkannt = f.vorschaden_erkannt
FROM public.faelle_claim_bridge b
JOIN public.faelle f ON f.id = b.fall_id
WHERE b.claim_id = c.id
  AND c.vorschaden_erkannt IS NULL
  AND f.vorschaden_erkannt IS NOT NULL;
