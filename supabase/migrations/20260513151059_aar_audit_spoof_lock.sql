-- RLS-Hardening Phase 2 — Audit-Spoofing Lock (mitteilungen + phase_transitions).
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (CRITICAL §1.3)
-- Vorgänger: docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md (#6)
--
-- Vorher:
--   • mitteilungen.mitteilungen_insert: FOR INSERT TO public WITH CHECK (true)
--     → anon kann Mitteilungen mit beliebigem `empfaenger_id` einfügen →
--       Impersonation in der Inbox eines fremden Users.
--   • phase_transitions.phase_transitions_service_insert:
--     FOR INSERT TO public WITH CHECK (true)
--     → anon kann fake-Status-Wechsel mit beliebigem `fall_id` + Grund
--       erzeugen, die später Dispatch+Admin als "echte" Historie sehen.
--
-- Caller-Befund (Code-Sweep 13.05.2026):
--   • mitteilungen: alle 4 INSERT-Stellen (`create-mitteilung.ts`,
--     `public-rueckruf.ts`, `gutachter-finder-actions.ts`, `event-stream.ts`)
--     nutzen `createAdminClient` (service_role) → bypass RLS, brauchen
--     keine Policy.
--   • phase_transitions: 2 INSERTs via `createAdminClient` (state-machine.ts,
--     endzustand-actions.ts) + 1 INSERT in `manual-phase-override.ts` via
--     cookie-authenticated Client *nach* Admin-Rolle-Check → wird von der
--     bestehenden `phase_transitions_staff_all`-Policy gedeckt
--     (admin/kundenbetreuer/dispatch).
--   → Beide public/INSERT-Policies können ersatzlos entfernt werden.
--
-- Nachher:
--   • mitteilungen: SELECT/UPDATE bleiben unverändert (gated `empfaenger_id = auth.uid()`).
--     INSERT: keine Policy → default-deny für anon/authenticated.
--     service_role bypasst (alle Caller laufen so).
--   • phase_transitions: SELECT (own_fall) + ALL (staff_all) bleiben unverändert.
--     Der separate public/INSERT-Slot entfällt — staff_all deckt admin/kb/dispatch,
--     state-machine läuft als service_role.

DROP POLICY IF EXISTS "mitteilungen_insert" ON public.mitteilungen;
DROP POLICY IF EXISTS "phase_transitions_service_insert" ON public.phase_transitions;

-- Keine neuen Policies — default-deny + service_role-bypass reichen.

-- Rollback-Snippet (NICHT als Migration applied):
--
-- CREATE POLICY "mitteilungen_insert" ON public.mitteilungen
--   FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "phase_transitions_service_insert" ON public.phase_transitions
--   FOR INSERT TO public WITH CHECK (true);
