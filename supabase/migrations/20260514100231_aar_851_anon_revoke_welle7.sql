-- AAR-851 — Anon-Rolle Schema-Exposure auf Welle-7-Claims-Tabellen eingrenzen
--
-- Befund (Supabase-Advisors `pg_graphql_anon_table_exposed`): anon hat SELECT-GRANT
-- auf 15+ Welle-7-Tabellen. RLS-Policies greifen (Daten kommen nicht raus, 0 Rows),
-- aber `pg_graphql` exponiert das Schema (Tabellen + Spalten + FK-Beziehungen) via
-- Introspection. Information-Disclosure-Risiko ohne Daten-Leak.
--
-- Pre-Audit (2026-05-14):
--   * 15 Zieltabellen + 1 View existieren ✓
--   * 0 anon-PERMISSIVE-Policies auf allen 16 → REVOKE risikofrei für RLS-Pfade
--   * anon-Test-SELECT auf gutachter_termine liefert 0 Rows → kein legitimer Read
--   * Code-Pfade: alle Server-Component-Reads via createAdminClient (service_role),
--     Browser-Client-Reads in /kunde/termin/[token] sind effektiv dead-code (liefern
--     schon heute 0 Rows) — Realtime-Subscription läuft über separate Publication
--   * kunde_gutachten_requests wurde bereits durch AAR-709 mit REVOKE behandelt
--     → wird hier ausgelassen, kein Doppel-REVOKE
--
-- Verbleibendes Smoke-Risiko: Realtime-Subscriptions auf gutachter_termine.
-- Realtime-Publication ist orthogonal zu Table-Grants, sollte unbeeinträchtigt sein —
-- wird in Post-Apply-Smoke verifiziert.

REVOKE SELECT ON
  public.claims,
  public.claim_payments,
  public.claim_parties,
  public.claim_mietwagen,
  public.claim_vehicle_involvements,
  public.gutachten,
  public.gutachten_fotos,
  public.gutachten_positionen,
  public.gutachter_termine,
  public.kanzlei_pakete,
  public.phase_transitions,
  public.repairs,
  public.vs_korrespondenz,
  public.airdrop_invitations,
  public.v_claim_timeline
FROM anon;
