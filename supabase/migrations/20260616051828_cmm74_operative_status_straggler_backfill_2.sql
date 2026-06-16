-- CMM-74: 2. Straggler-Backfill operative_status (Merge-Session 16.06., Aaron "go beide"+"weiter").
-- Fängt c8ec2ba6 (Konvert-Straggler von pre-#2884 d8bfbb86, 2026-06-15 18:30, jetzt inaktiv) +
-- jeden weiteren NULL-Claim. Idempotent (WHERE operative_status IS NULL). Value-neutral:
-- operative_status == faelle.status — exakt der Wert, den der Reader-Fallback heute schon liefert.
-- Pflicht-Vorbedingung fuer #2902 (state-machine claim-native, :81 bricht hart auf NULL).
UPDATE public.claims c
SET operative_status = f.status::text
FROM public.faelle f
WHERE f.claim_id = c.id AND c.operative_status IS NULL AND f.status IS NOT NULL;
