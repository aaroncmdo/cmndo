-- CMM-49 P2: zwei tote Legacy-Views droppen.
-- faelle_kunde_view / faelle_sv_view: 0 Code-Query + 0 DB-Referenz (verifiziert 03.06.,
-- nur database.types.ts-Metadata + 1 Kommentar). Ehemals anon-lesbar (anon-GRANT via #2318
-- revoked). Keine echten Consumer -> ersatzlos weg. Idempotent + replay-safe (kein CASCADE,
-- 0 Dependents verifiziert -> faellt laut wenn doch eins existiert).
DROP VIEW IF EXISTS public.faelle_kunde_view;
DROP VIEW IF EXISTS public.faelle_sv_view;
