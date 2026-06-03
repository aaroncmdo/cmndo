-- CMM-63: claims.geschaedigter_user_id an faelle.kunde_id angleichen, wo sie divergieren.
-- 1 Live-Mismatch (Smoke-Fall CLM-2026-00115): claims.geschaedigter_user_id war 'Lisa Mueller'
-- (113aebe5), aber die normalisierte SSoT claim_parties (rolle=geschaedigter) + faelle.kunde_id
-- + lead.kunde_id sagen ALLE 'Smoke Szenario' (80ff9fe2). claims-Wert war der stale Ausreisser,
-- inkonsistent mit seinem eigenen claim_parties -> Angleichung an die Wahrheit.
-- Idempotent (re-run = no-op). Auf Fresh-Replay 0 Rows (Mismatch existiert nur in Live-Daten).
-- Macht claims.geschaedigter_user_id == faelle.kunde_id fuer ALLE -> entsperrt die
-- Konsolidierung auf EINE Kunden-Spalte (CMM-63).
UPDATE public.claims c
SET geschaedigter_user_id = f.kunde_id
FROM public.faelle f
WHERE f.claim_id = c.id
  AND f.kunde_id IS NOT NULL
  AND c.geschaedigter_user_id IS DISTINCT FROM f.kunde_id;
