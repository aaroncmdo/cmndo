-- Defense-in-Depth 2026-05-14: Admin-RLS-Policies auf TO authenticated einschränken
--
-- Befund: 12 admin-only Policies in 11 Tabellen haben polroles={-} (PUBLIC) und
-- rufen is_admin() (+ ggf. is_dispatcher(), is_kundenbetreuer(), can_access_fall())
-- im USING-Clause auf. Wenn anon eine dieser Tabellen liest, evaluiert Postgres
-- die Policy → der Function-Call erfolgt mit Caller-Privilegien (auch bei
-- SECURITY DEFINER → nur der Function-Body läuft als Owner). Geht ein
-- EXECUTE-Grant für anon verloren (wie am 14.05. via aar_fn_revoke_execute_
-- security_definer geschehen → siehe PROD-BREAKER-MARKETING-KARTE.md), schlagen
-- silent alle anon-Reads auf diese Tabellen mit 42501 fehl.
--
-- Saubere Lösung: Policies sind logisch nur für authenticated Users relevant
-- (anon kann niemals admin/dispatch/kundenbetreuer sein). ALTER POLICY ... TO
-- authenticated entfernt die Policy aus der anon-Evaluierung komplett:
--   * Performance: anon ruft is_admin() nicht mehr → weniger DB-CPU pro Request
--   * Robustness: Grant-Drift auf is_admin/is_dispatcher/etc. bricht anon-
--     Reads nicht mehr
--   * Security: kein Pfad für Information-Disclosure via Policy-Evaluation
--     (anon kann die Function selbst nicht mehr erreichen)
--
-- Verhalten-Analyse (vor/nach):
--   * Für anon: is_admin()/is_dispatcher()/is_kundenbetreuer() returnen
--     konstant false. Die admin-Policy hat anon noch nie Rows freigegeben.
--     Nach Refactor: Policy wird nicht mehr evaluiert → gleiches Ergebnis,
--     0 Rows. Tabellen mit zusätzlicher anon-Policy (sachverstaendige,
--     leads) bleiben über die andere Policy lesbar — die wird hier nicht
--     angefasst.
--   * Für authenticated: gleiches Verhalten — Policy wird weiter evaluiert.
--
-- Audit-Trail: docs/14.05.2026/gutachter-finder-audit/PROD-BREAKER-MARKETING-KARTE.md
-- erwähnt diese Migration als "Defense-in-Depth Folge-Ticket". PR #1109 (Hotfix
-- GRANT EXECUTE is_admin() TO anon) bleibt parallel als Sicherheits-Netz —
-- falls in Zukunft eine neue PUBLIC-Policy mit is_admin() angelegt wird, schlägt
-- sie nicht mehr silent fehl.

-- ─── 1. claim_parties.cp_staff_all ─────────────────────────────────────
ALTER POLICY "cp_staff_all" ON public.claim_parties TO authenticated;

-- ─── 2. claims.claims_staff_all_consolidated ────────────────────────────
ALTER POLICY "claims_staff_all_consolidated" ON public.claims TO authenticated;

-- ─── 3. faelle.faelle_staff_all_consolidated ────────────────────────────
ALTER POLICY "faelle_staff_all_consolidated" ON public.faelle TO authenticated;

-- ─── 4. leads.leads_staff_all_consolidated ──────────────────────────────
ALTER POLICY "leads_staff_all_consolidated" ON public.leads TO authenticated;

-- ─── 5. parteien."Admins full access" ───────────────────────────────────
ALTER POLICY "Admins full access" ON public.parteien TO authenticated;

-- ─── 6. profiles."Profil bearbeiten" + "Profil lesen" ──────────────────
-- Auch wenn der USING-Clause `(id = auth.uid() OR is_admin())` für anon
-- theoretisch `(NULL = NULL OR false)` = false ist, kann der Trigger-Pfad
-- bei späteren ALTER COLUMNS o.ä. das Verhalten subtil ändern. Sicher ist
-- sicher: TO authenticated.
ALTER POLICY "Profil bearbeiten" ON public.profiles TO authenticated;
ALTER POLICY "Profil lesen" ON public.profiles TO authenticated;

-- ─── 7. sachverstaendige."Admins full access" ──────────────────────────
-- WICHTIG: sachverstaendige_anon_select_map_ready bleibt unverändert
-- (polroles={anon}, USING ohne Function-Call) → /gutachter-finden Marketing-
-- Karte funktioniert weiter.
ALTER POLICY "Admins full access" ON public.sachverstaendige TO authenticated;

-- ─── 8. schadenspositionen."Admins full access" ─────────────────────────
ALTER POLICY "Admins full access" ON public.schadenspositionen TO authenticated;

-- ─── 9. settings."Admins full access" ───────────────────────────────────
ALTER POLICY "Admins full access" ON public.settings TO authenticated;

-- ─── 10. tasks.tasks_all_public_consol ──────────────────────────────────
-- USING-Clause ruft auch can_access_fall(uuid). Function hat aktuell kein
-- EXECUTE-Grant für anon → Policy würde für anon ohnehin erroren. TO
-- authenticated nimmt anon aus der Evaluierung raus.
ALTER POLICY "tasks_all_public_consol" ON public.tasks TO authenticated;

-- ─── 11. timeline."Admins full access" ──────────────────────────────────
ALTER POLICY "Admins full access" ON public.timeline TO authenticated;

-- ─── Verifikation ──────────────────────────────────────────────────────
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM pg_policy pol
  JOIN pg_class c ON pol.polrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE pol.polroles::regrole[] = '{-}'
    AND pg_get_expr(pol.polqual, pol.polrelid) LIKE '%is_admin%'
    AND n.nspname = 'public';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Hardening nicht vollständig: % PUBLIC-Policies rufen weiter is_admin()', remaining;
  END IF;
  RAISE NOTICE 'RLS-Hardening verifiziert: 0 PUBLIC-Policies rufen mehr is_admin()';
END $$;
