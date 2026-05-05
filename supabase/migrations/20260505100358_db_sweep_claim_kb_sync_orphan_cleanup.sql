-- DB-SWEEP 2026-05-05: claim ↔ fall KB-Sync + Orphan-Cleanup
--
-- Findings aus dem Sweep nach den heutigen Merges (PR #480/#481/#483/#484):
--
--   1. kundenbetreuer_id-Drift in 6/13 Fällen — kb-assignment.ts hat bisher
--      nur in faelle geschrieben, claims (= SoT) blieb stale. Code ist im
--      gleichen Branch gefixt (updateKbOnFallAndClaim-Helper) — diese
--      Migration backfillt die bestehende Drift.
--
--   2. claims hatte keinen Rolle-Trigger (faelle hat einen, der nur
--      'kundenbetreuer'/'admin' als kundenbetreuer_id zulässt). Folge:
--      5 Claims zeigen auf Dispatch-User als KB — ungültig laut faelle-
--      Trigger. Heißt: faelle hat den korrekten KB, claims muss korrigiert
--      werden (umgekehrte Richtung als zunächst angenommen).
--
--   3. 7 orphan pflichtdokumente — fall_id zeigt auf nicht-mehr-existente
--      faelle (vermutlich nach Test-Fall-Löschungen ohne FK-Cascade).
--
-- Idempotent: alle UPDATEs/DELETEs sind so geschrieben dass mehrfaches
-- Ausführen den Endzustand nicht ändert.

-- ─── Sektion 1: KB-Drift backfillen ──────────────────────────────────────
-- Strategie nach Rollen-Validität:
--   • Wenn claims.kb auf Dispatch/Inaktiv/NULL zeigt UND faelle.kb gültig
--     (kundenbetreuer/admin) → faelle nach claims (faelle ist hier SoT)
--   • Wenn claims.kb gültig UND faelle.kb davon abweicht → claims nach
--     faelle (claim ist normalfall-SoT)

-- 1a. Ungültige claims.kb (Dispatch-User oder andere falsche Rolle) →
-- mit faelle.kb überschreiben, sofern faelle eine gültige Rolle hat.
UPDATE public.claims c
SET kundenbetreuer_id = f.kundenbetreuer_id
FROM public.faelle f, public.profiles p_f, public.profiles p_c
WHERE f.claim_id = c.id
  AND p_f.id = f.kundenbetreuer_id
  AND p_c.id = c.kundenbetreuer_id
  AND p_c.rolle NOT IN ('kundenbetreuer', 'admin')
  AND p_f.rolle IN ('kundenbetreuer', 'admin')
  AND f.kundenbetreuer_id IS NOT NULL;

-- 1b. claims.kb=NULL, faelle.kb gültig → claims nachziehen
UPDATE public.claims c
SET kundenbetreuer_id = f.kundenbetreuer_id
FROM public.faelle f, public.profiles p_f
WHERE f.claim_id = c.id
  AND p_f.id = f.kundenbetreuer_id
  AND c.kundenbetreuer_id IS NULL
  AND f.kundenbetreuer_id IS NOT NULL
  AND p_f.rolle IN ('kundenbetreuer', 'admin');

-- 1c. claims.kb gültig, faelle abweichend → faelle nachziehen (claim als SoT
-- für gültige Werte). Der faelle-Trigger lässt das durchlaufen weil das
-- Ziel (claims-KB) per Definition eine gültige Rolle hat.
UPDATE public.faelle f
SET kundenbetreuer_id = c.kundenbetreuer_id,
    updated_at = NOW()
FROM public.claims c, public.profiles p_c
WHERE f.claim_id = c.id
  AND p_c.id = c.kundenbetreuer_id
  AND p_c.rolle IN ('kundenbetreuer', 'admin')
  AND f.kundenbetreuer_id IS DISTINCT FROM c.kundenbetreuer_id;

-- ─── Sektion 2: Orphan pflichtdokumente löschen ───────────────────────────
DELETE FROM public.pflichtdokumente pd
WHERE NOT EXISTS (
  SELECT 1 FROM public.faelle f WHERE f.id = pd.fall_id
);
