-- AAR-921 — RLS-Drift-Backfill: SECURITY-DEFINER-Grants idempotent absichern
--
-- Hintergrund: AAR-894 (14.05.2026). Drei SECDEF-Functions, die in RLS-Policies
-- konsumiert werden, hatten ihre GRANT EXECUTE TO authenticated durch
-- CREATE-OR-REPLACE-Roundtrips verloren — SV-Plan war leer, Cron-Reminders silent.
-- Ein is_admin()-Short-Circuit hat den Fehler vor Admins versteckt.
--
-- Ziel: Idempotente Migration die für ALLE in pg_policies referenzierten
-- SECDEF-Functions GRANT EXECUTE TO authenticated (re)setzt. Re-runnable per
-- Definition (kein DROP/REVOKE, nur GRANT).
--
-- Inventur-Stand 15.05.2026 (paizkjajbuxxksdoycev):
--   can_access_fall          19 Policies (abrechnung_positionen, calls, fall_dokumente, ...)
--   dispatcher_owns_lead      1 Policy   (claims)
--   get_sv_id                 8 Policies (gutschriften, individuelle_anfragen, ...)
--                             *** authenticated EXECUTE fehlte vor dieser Migration ***
--   is_admin                 34 Policies (cross-table, häufigste)
--   is_claim_user_party       3 Policies (claim_parties, claims, gutachter_termine)
--   is_dispatcher             2 Policies (claim_parties, claims)
--   is_kanzlei                1 Policy   (forderungspositionen)
--   is_kundenbetreuer         2 Policies (claim_parties, claims)
--   is_staff                  8 Policies (incentives, profiles, regulierungs_klassifizierung, ...)
--   is_sv                     4 Policies (claim_parties, claims, tasks, vertragsvorlagen)
--   is_sv_for_claim           2 Policies (claim_parties, claims)
--
-- Drift-Check: scripts/check-rls-function-grants.mjs (CI-Step).

BEGIN;

-- 11 RLS-referenzierte SECDEF-Functions: authenticated muss EXECUTE haben,
-- sonst evaluiert die Policy zu false und der User sieht 0 Rows.
GRANT EXECUTE ON FUNCTION public.can_access_fall(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatcher_owns_lead(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sv_id()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_claim_user_party(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dispatcher()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kanzlei()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kundenbetreuer()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid)         TO authenticated;

-- service_role behält EXECUTE auf alle (cron-jobs + admin-rpc).
-- Wir setzen es hier nochmal explizit für die 11 Functions, damit zukünftiges
-- CREATE OR REPLACE FUNCTION (welches Grants resettet) durch Re-Run dieser
-- Migration sofort wieder heilbar ist.
GRANT EXECUTE ON FUNCTION public.can_access_fall(uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatcher_owns_lead(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sv_id()                   TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.is_claim_user_party(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.is_dispatcher()               TO service_role;
GRANT EXECUTE ON FUNCTION public.is_kanzlei()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.is_kundenbetreuer()           TO service_role;
GRANT EXECUTE ON FUNCTION public.is_staff()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.is_sv()                       TO service_role;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid)         TO service_role;

COMMIT;
