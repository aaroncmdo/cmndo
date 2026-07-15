-- Anon-Grant-Cap Runde 2 (Boy-Scout, Anon-Grant-Ratchet PR #4403): surgical column-revoke der
-- internen Notiz-Spalten auf den 4 bereits column-capped Tabellen (table-grant=FALSE seit
-- #4383/#4317). Latent (RLS-Policies auth.uid()-gated -> true-anon 0 Zeilen). Sicher:
--   * Kein Consumer selektiert diese Notiz-Spalten (nur explizite Spaltenlisten im Code).
--   * Kein anon .select('*') auf diesen Tabellen -- sie sind bereits column-capped, ein anon
--     .select('*') wuerde schon heute 42501 werfen (das einzige .select('*') auf
--     personenschaden_personen laeuft im dispatch-Kontext = authenticated, nicht anon).
-- Weil table-grant=FALSE, greift der reine Column-Revoke (has_column_privilege -> false), ohne
-- die Finder-/benignen Spalten oder authenticated/service_role anzufassen.
revoke select (filmcheck_notizen, sv_notizen_vor_ort, technische_stellungnahme_notiz_sv)
  on public.auftraege from anon;
revoke select (notizen) on public.makler from anon;
revoke select (notizen) on public.werkstaetten from anon;
revoke select (notizen) on public.personenschaden_personen from anon;
