-- AAR-839 Step 8/8: Phase-Backfill aller bestehenden Claims
--
-- Nachdem calc_claims_phase neu deployed ist (Step 5) und alle CHECK-
-- Constraints aktiv sind (Step 4 + 7), berechnen wir die Phase für alle
-- bestehenden Claims neu. Das stellt sicher dass die phase-Spalte mit
-- der Function-Logik konsistent ist.
--
-- Pre-Flight: Alle 4 prod-Rows sind 'dispatch_done'/kein KB → bleiben auf
-- '1_neu'. Backfill ist no-op auf prod, aber wichtig für lokale/Branch-DBs
-- mit Test-Daten.

UPDATE public.claims
   SET phase = public.calc_claims_phase(id, status, kundenbetreuer_id);
