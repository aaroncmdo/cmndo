-- CMM-49 Drop-Runway Phase "a": technische_probleme von faelle entkoppeln.
-- 0 Rows. claim_id da (rekey). KEINE fall_id-Policy (pol_fallid=0). Einzige Code-Nutzung
-- admin/support/page.tsx liest OHNE fall_id (alle Tickets). delete_fall_komplett(2-arg)
-- hat technische_probleme in v_claim_tables -> Loeschung via claim_id; der fall_id-Loop
-- ist EXCEPTION-WHEN-OTHERS (fail-caught). Dependents: nur trg_derive_claim_id (droppen;
-- Fn derive_claim_id_from_fall bleibt, ~42 Trigger-geteilt) + FK/Index (fallen mit Spalte).
DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.technische_probleme;
ALTER TABLE public.technische_probleme DROP COLUMN fall_id;
