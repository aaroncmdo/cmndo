-- AAR-894: EXECUTE-Grants für RLS-Funktionen wiederherstellen.
--
-- Aufgedeckt beim Browser-Smoke der Dispatcher-Karte (siehe auch
-- 20260514105054_aar_894_grant_dispatcher_owns_lead.sql). SELECT auf `leads`
-- triggert via Subquery RLS-Policies auf `claims`/`faelle`, deren Quals diese
-- Funktionen aufrufen. Ohne EXECUTE-Grant für authenticated wirft Postgres 42501.
--
-- Audit-Befund (has_function_privilege gegen authenticated, vor Migration):
--   is_admin              → true
--   is_dispatcher         → true
--   is_kundenbetreuer     → true
--   is_staff              → true
--   dispatcher_owns_lead  → true (nach 20260514105054)
--   is_claim_user_party   → FALSE  ← Block
--   is_sv_for_claim       → FALSE  ← nächster Block
--
-- Alle 7 sind SECURITY DEFINER und prüfen nur Ownership/Membership-Logik —
-- Grant an authenticated ist safe (Funktion entscheidet selbst was sie returnt).

GRANT EXECUTE ON FUNCTION public.is_claim_user_party(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO authenticated;
