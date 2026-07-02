-- Makler-Aktivierung (Follow-up zu PR #3451): sendMaklerWelcome loggt mit
-- empfaenger_typ='makler', aber der CHECK-Constraint erlaubte nur kunde/sv/kanzlei/admin/
-- werkstatt -> der pending-Insert in sendEmail (client.ts) warf eine check_violation (23514),
-- die im best-effort-try/catch der Registrierung still verschluckt wurde -> die Welcome-Mail
-- kam nie an. 'makler' additiv ergaenzen; der Consumer-Code ist bereits prod-deployed.
alter table public.email_log drop constraint if exists email_log_empfaenger_typ_check;
alter table public.email_log add constraint email_log_empfaenger_typ_check
  check (empfaenger_typ = any (array['kunde','sv','kanzlei','admin','werkstatt','makler']));
