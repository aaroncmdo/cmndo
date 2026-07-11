-- Slice-4 regulierungs_betrag Retire (Teil 2/2): Column-Drop. v_claim_base + v_claim_timeline lesen
-- jetzt aus dem (claim,'vs')-Ledger (Migration slice4_views_null_regulierungs_betrag_ref). Reader-safe
-- (kein direkter claims-Reader; regulierung_betrag-Consumer lesen via View->Ledger), writer-safe
-- (Divergenz-Bug #4052 fixed: kanzlei-paket/stammdaten/lexdrive routen alle zum Ledger; CLUSTER3-Map inert).
-- 0 Dependency (pg_depend leer). Damit ist das claims-Money-Cache-Kern retired (bis auf marketing_provision
-- #4102-gated + auszahlung_zahlungsweg 412850cd-Lane).
ALTER TABLE public.claims DROP COLUMN regulierungs_betrag;
