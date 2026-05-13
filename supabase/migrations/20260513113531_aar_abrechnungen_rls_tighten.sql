-- RLS-Hardening Phase 1 — Sub-Plan #5: abrechnungen.
--
-- Spec: docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md
-- Audit: docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md (HIGH #5)
--
-- Vorher: 1 Policy `abrechnungen_auth` mit
--   USING(auth.role() = ANY(ARRAY['authenticated','service_role'])) FOR ALL
-- → jeder eingeloggte User (SV/Makler/Kanzlei/Kunde/Dispatch/…) liest UND
--   schreibt ALLE Abrechnungen, unabhängig von empfaenger_typ/empfaenger_id.
--
-- Schema-Realität: abrechnungen ist polymorph via (empfaenger_typ, empfaenger_id).
--   empfaenger_typ ∈ {'marketing','kanzlei','sv','makler'} (CHECK-Constraint).
--   empfaenger_id zeigt je nach Typ auf sachverstaendige.id / makler.id /
--   kanzleien.id / NULL (marketing intern).
--
-- Nachher (4 SELECT-Policies + Writes nur service_role):
--   • admin: alle (via is_admin())
--   • sv: empfaenger_typ='sv' AND empfaenger_id ∈ (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())
--   • makler: empfaenger_typ='makler' AND empfaenger_id ∈ (SELECT id FROM makler WHERE user_id = auth.uid())
--   • kanzlei wird über Magic-Link-Page (/kanzlei/abrechnung/[token]) konsumiert,
--     nicht via authenticated session → keine Policy nötig
--   • marketing-Einträge: nur admin (via is_admin())
--   • INSERT/UPDATE/DELETE: keine Policies für authenticated → default-deny,
--     service_role bypasst RLS strukturell.
--
-- Caller-Befund (Sweep am 13.05.2026):
--   8 Admin-Files nutzen createClient (cookie-authenticated) und lesen abrechnungen.
--   Bleiben funktional via is_admin()-SELECT-Policy (kein Caller-Refactor nötig).
--   9 Files nutzen createAdminClient (service_role) → unverändert sicher.

DROP POLICY IF EXISTS "abrechnungen_auth" ON public.abrechnungen;

-- Admin: SELECT alle
CREATE POLICY "abrechnungen_select_admin"
  ON public.abrechnungen FOR SELECT TO authenticated
  USING (public.is_admin());

-- SV: SELECT eigene
CREATE POLICY "abrechnungen_select_sv"
  ON public.abrechnungen FOR SELECT TO authenticated
  USING (
    empfaenger_typ = 'sv'
    AND empfaenger_id IN (
      SELECT id FROM public.sachverstaendige WHERE profile_id = auth.uid()
    )
  );

-- Makler: SELECT eigene
CREATE POLICY "abrechnungen_select_makler"
  ON public.abrechnungen FOR SELECT TO authenticated
  USING (
    empfaenger_typ = 'makler'
    AND empfaenger_id IN (
      SELECT id FROM public.makler WHERE user_id = auth.uid()
    )
  );

-- Keine INSERT/UPDATE/DELETE-Policies → default-deny für authenticated.
-- service_role bypasst RLS (alle Write-Caller laufen über createAdminClient).

-- Rollback-Snippet (NICHT als Migration applied):
--
-- DROP POLICY IF EXISTS "abrechnungen_select_admin" ON public.abrechnungen;
-- DROP POLICY IF EXISTS "abrechnungen_select_sv" ON public.abrechnungen;
-- DROP POLICY IF EXISTS "abrechnungen_select_makler" ON public.abrechnungen;
-- CREATE POLICY "abrechnungen_auth" ON public.abrechnungen
--   FOR ALL TO authenticated
--   USING (auth.role() = ANY(ARRAY['authenticated','service_role']));
