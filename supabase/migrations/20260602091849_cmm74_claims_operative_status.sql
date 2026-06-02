-- CMM-74 b-double-prime (Variante A): privater Engine-Transition-Cursor auf claims.
-- Ersetzt faelle.status als Cursor (faelle.status-Vokabular, 19 Werte) -> der faelle-Drop
-- verliert den Cursor nicht mehr. 0 externe Reader ausserhalb der Engine + Reader-Tail
-- (der mit-repointet wird). Additiv + Backfill aus dem (noch existierenden) faelle.status.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS operative_status text;
COMMENT ON COLUMN public.claims.operative_status IS
  'CMM-74 b-double-prime (Variante A): privater Engine-Transition-Cursor (faelle.status-Vokabular). Ersetzt faelle.status als Cursor. Geschrieben von transitionFallStatus + direkten Status-Writern; gelesen vom Engine-Cursor + Reader-Tail (billing/email/search/completion-signals).';
UPDATE public.claims c
   SET operative_status = f.status
  FROM public.faelle f
 WHERE f.claim_id = c.id AND c.operative_status IS NULL;
