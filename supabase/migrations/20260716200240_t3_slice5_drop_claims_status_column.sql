-- T3-S5 (FINAL): DROP claims.status — die Lifecycle-/Terminal-Achse ist vollstaendig auf
-- claims.operative_status konsolidiert (Status-Achsen-Konsolidierung T3, 5 Slices).
--
-- Vorbedingungen (alle prod-verifiziert 16.07.):
--   S1-S4 deployed: kein Code-Reader (S2a/b/c #4414/#4417/#4418), keine View (S3 #4421,
--   pg_depend = 0), keine Funktion (cron_verjaehrungs_warner in S3 repointet), kein Writer
--   (S4 #4436; Regel-4-Smoke: Endzustand-Action live gruen, status blieb NULL).
--   Keine Policies referenzieren status; kein Trigger fasst NEW./OLD.status an.
--
-- Mitfallende Objekte explizit: 2 Indizes + CHECK-Constraint. Column-Grants
-- (u.a. aus 20260714220455) fallen mit der Spalte.
DROP INDEX IF EXISTS public.idx_claims_status_offen;
DROP INDEX IF EXISTS public.idx_claims_status_dispatch;
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE public.claims DROP COLUMN IF EXISTS status;
