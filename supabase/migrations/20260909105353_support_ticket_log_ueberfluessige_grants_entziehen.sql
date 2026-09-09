-- support_ticket_log trug Grants, die niemand ausuebt und die RLS heute blockt:
--   authenticated: DELETE, INSERT, UPDATE, TRUNCATE  (bei 0 Write-Policies)
--   anon:          SELECT                            (Policy haengt ganz an auth.uid())
--
-- Gemessen 09.09.2026 vor dem Eingriff:
--   * Schreiber im Code: NUR createAdminClient() (service_role), api/support/chat/route.ts:516
--   * Leser im Code:     NUR createAdminClient() (service_role), admin/support/page.tsx:89
--   * Client-seitige Leser: KEINE (beide Dateien sind Server-Components)
--   * Write-Policies auf der Tabelle: 0
--
-- Es ist also kein offenes Leck, sondern ein LATENTER Grant: er wird scharf in dem Moment, in
-- dem jemand eine Write-Policy ergaenzt, ohne die Grants zu pruefen. TRUNCATE wiegt dabei am
-- schwersten — es ignoriert RLS vollstaendig und wuerde das gesamte Support-Protokoll in einem
-- Zug loeschen, ohne Policy-Pruefung und ohne Zeilenfilter.
--
-- SELECT fuer authenticated BLEIBT: die bestehende Policy support_ticket_log_select_public_consol
-- braucht es (admin/kundenbetreuer sehen alles, sonst die eigenen Zeilen).
-- service_role bleibt unangetastet — dort laeuft der gesamte Betrieb.

revoke delete, insert, update, truncate on public.support_ticket_log from authenticated;
revoke select on public.support_ticket_log from anon;
