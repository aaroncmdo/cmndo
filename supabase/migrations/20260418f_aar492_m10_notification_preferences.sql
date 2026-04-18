-- AAR-492 (M10): Makler-Benachrichtigungs-Präferenzen als jsonb.
ALTER TABLE public.makler
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"neuer_lead":true,"kanzlei_uebergabe":true,"provision_freigegeben":true,"monats_abrechnung":true,"woechentlicher_report":false}'::jsonb;

COMMENT ON COLUMN public.makler.notification_preferences IS
  'AAR-492: Email-Benachrichtigungs-Präferenzen (Opt-In/Out). Schema: neuer_lead|kanzlei_uebergabe|provision_freigegeben|monats_abrechnung|woechentlicher_report : bool.';
