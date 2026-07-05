-- Makler-Wochenreport: Opt-out-Spalte (default-on Modell).
-- Der Report geht per Default an alle aktiven Makler; wer sich ueber den
-- One-Click-Abmelde-Link in der Mail abmeldet, bekommt hier einen Timestamp
-- gesetzt (null = abonniert). Ersetzt das fruehere Opt-in-Toggle
-- notification_preferences.woechentlicher_report (praktisch 0 Adoption).
ALTER TABLE public.makler ADD COLUMN IF NOT EXISTS wochenreport_abgemeldet_am timestamptz;
COMMENT ON COLUMN public.makler.wochenreport_abgemeldet_am IS 'Opt-out des woechentlichen Reports (null = abonniert/default-on). Gesetzt vom One-Click-Abmelde-Link in der Report-Mail.';
