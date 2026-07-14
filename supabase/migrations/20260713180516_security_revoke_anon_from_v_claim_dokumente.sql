-- Security: REVOKE der Supabase-Default-anon-Over-Grants auf v_claim_dokumente.
-- Angewendet auf prod von der Merge-Session 81215cc3 (Release-Konsolidierung #4179),
-- weil der Default-anon-GRANT den Anon-Exposure-Guard (scripts/check-anon-exposure.mjs,
-- build-CI gegen live prod) brach ("anon-lesbar UND security_invoker=false -> RLS-Bypass").
-- Funktional 0 Aenderung: v_claim_dokumente ist ein DEFINER-View mit Function-Gate
-- (claim_sichtbar_fuer_aktuellen_user) -> anon (kein auth.uid) sah ohnehin 0 Rows.
-- In diese Lane aufgenommen NACH der View-CREATE (20260713174353) fuer Replay-Konsistenz.
-- WICHTIG: kein Re-GRANT an anon in kuenftigen View-Defs (Default-Over-Grant kommt bei
-- DROP+CREATE zurueck -> dann erneut revoken).
revoke all on public.v_claim_dokumente from anon;
