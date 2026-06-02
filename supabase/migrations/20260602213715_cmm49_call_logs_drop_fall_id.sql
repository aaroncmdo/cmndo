-- CMM-49 Drop-Runway Phase "a" (Call-Logs): aircall_calls/calls/matelso_calls von faelle entkoppeln.
-- "b"-Reader/Writer-Repoint (#2290) ist in main/Prod -> kein deployter Code liest fall_id.
-- 0-Row, claim_id da. delete_fall_komplett referenziert KEINE der 3 (weder v_fall_tables noch
-- v_claim_tables) -> keine Funktions-Surgery. Keine Views, KEINE fall_id-Policy, nur
-- trg_derive_claim_id (droppen; Fn derive_claim_id_from_fall bleibt, trigger-geteilt).
-- FK + Index fallen mit der Spalte.
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.aircall_calls;
ALTER TABLE public.aircall_calls DROP COLUMN fall_id;
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.calls;
ALTER TABLE public.calls DROP COLUMN fall_id;
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.matelso_calls;
ALTER TABLE public.matelso_calls DROP COLUMN fall_id;
