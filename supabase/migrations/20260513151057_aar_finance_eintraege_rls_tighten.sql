-- RLS-Hardening Phase 2 — finance_eintraege.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (CRITICAL §1.1)
-- Vorgänger: docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md (M5)
--
-- Vorher: 1 Policy `Authenticated can manage finance_eintraege` mit
--   FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- → jeder eingeloggte User (Kunde, SV, Makler, externer Gast, jeder Account
--   mit gültigem JWT) konnte via PostgREST alle Finance-Einträge lesen,
--   einfügen, ändern, löschen. Buchhaltungs-Daten = sensibel.
--
-- Caller-Befund (Audit 12.05.2026 + Code-Sweep 13.05.2026):
--   Sämtliche Writes laufen über `createAdminClient` (service_role).
--   Reads ausschließlich aus Admin-Routen (`/admin/finance/*`) — Auth-Gate
--   via `ensureAdmin()`. Kein clientseitiger Zugriff von Kunde/SV/Makler.
--   → Sicher die ALL-true-Policy zu entfernen.
--
-- Nachher (1 SELECT-Policy + Writes nur service_role):
--   • admin: SELECT alle (via is_admin())
--   • INSERT/UPDATE/DELETE: keine Policies für authenticated → default-deny.
--     service_role bypasst RLS strukturell.
--   • Sub-Rollen (SV/Makler/Kanzlei) brauchen Reads NICHT — finance_eintraege
--     ist intern. Falls in Zukunft ein "Mein Umsatz"-View für SVs entsteht,
--     wird das über eine eigene rolle-spezifische Policy hinzugefügt.

DROP POLICY IF EXISTS "Authenticated can manage finance_eintraege" ON public.finance_eintraege;

-- Admin: SELECT alle
CREATE POLICY "finance_eintraege_select_admin"
  ON public.finance_eintraege FOR SELECT TO authenticated
  USING (public.is_admin());

-- Keine INSERT/UPDATE/DELETE-Policies → default-deny für authenticated.
-- service_role bypasst RLS (alle Write-Caller laufen über createAdminClient).

-- Rollback-Snippet (NICHT als Migration applied):
--
-- DROP POLICY IF EXISTS "finance_eintraege_select_admin" ON public.finance_eintraege;
-- CREATE POLICY "Authenticated can manage finance_eintraege"
--   ON public.finance_eintraege FOR ALL TO authenticated
--   USING (true) WITH CHECK (true);
