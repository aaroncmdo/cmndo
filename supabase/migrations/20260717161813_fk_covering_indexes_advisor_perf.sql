-- Perf-Advisor (unindexed_foreign_keys, 12 INFO-Funde 17.07.): jeder FK bekommt einen
-- covering Index. Additiv, non-breaking; alle Zieltabellen sind aktuell ~leer (tasks=24,
-- claims=13, Rest ~0) -> zero-lock/zero-cost, idealer Zeitpunkt fuer die Hygiene.
-- IF NOT EXISTS = idempotent (falls eine andere Lane parallel denselben Index anlegt).
CREATE INDEX IF NOT EXISTS idx_claims_eskaliert_an_admin_id ON public.claims (eskaliert_an_admin_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_enrollments_sequenz_id ON public.cold_mail_enrollments (sequenz_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_sends_enrollment_id ON public.cold_mail_sends (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_sends_step_id ON public.cold_mail_sends (step_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_sends_vorlage_id ON public.cold_mail_sends (vorlage_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_steps_vorlage_id ON public.cold_mail_steps (vorlage_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_suppression_lead_id ON public.cold_mail_suppression (lead_id);
CREATE INDEX IF NOT EXISTS idx_cold_mail_vorlagen_erstellt_von ON public.cold_mail_vorlagen (erstellt_von);
CREATE INDEX IF NOT EXISTS idx_fall_dokumente_hochgeladen_von_user_id ON public.fall_dokumente (hochgeladen_von_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_provisionen_lead_id ON public.partner_provisionen (lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_empfaenger_user_id ON public.tasks (empfaenger_user_id);
CREATE INDEX IF NOT EXISTS idx_technische_probleme_user_id ON public.technische_probleme (user_id);
