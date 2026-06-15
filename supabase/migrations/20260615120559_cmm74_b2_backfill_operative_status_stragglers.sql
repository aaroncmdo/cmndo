-- CMM-74 b2: Backfill operative_status fuer Konvert-Straggler — claims ohne operative_status,
-- entstanden bevor convert-lead-to-claim den Cursor bei Anlage setzte (2 Live-Rows, 2026-06-04/06-11).
-- Idempotent (WHERE operative_status IS NULL). Value-neutral: operative_status == faelle.status,
-- exakt der Wert, den der Reader-Fallback (operative_status ?? faelle.status) heute schon liefert.
UPDATE public.claims c
SET operative_status = f.status::text
FROM public.faelle f
WHERE f.claim_id = c.id AND c.operative_status IS NULL AND f.status IS NOT NULL;
