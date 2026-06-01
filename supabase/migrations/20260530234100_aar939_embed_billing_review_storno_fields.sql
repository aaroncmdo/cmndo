-- AAR-939 Stream 8 (B2): Billing-Storno + Review-Felder + eingefrorener SV auf
-- gutachter_finder_anfragen. Teil des AUTO-FÄLLIG-Modells: der Cron bucht €70
-- automatisch nach Terminzeit; diese Felder erlauben Team-Storno + SV-gemeldetes
-- Review (Kunde-Absage) + frieren den abrechnungs-SV zum Anfrage-Zeitpunkt ein.
ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS abrechnung_storniert_am timestamptz,
  ADD COLUMN IF NOT EXISTS abrechnung_storno_grund text,
  ADD COLUMN IF NOT EXISTS abrechnung_storno_durch_user_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS billing_review_status text,
  ADD COLUMN IF NOT EXISTS billing_review_grund text,
  ADD COLUMN IF NOT EXISTS billing_review_erstellt_am timestamptz,
  ADD COLUMN IF NOT EXISTS abrechnung_sv_id uuid REFERENCES public.sachverstaendige(id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gfa_billing_review_status_check') THEN
    ALTER TABLE public.gutachter_finder_anfragen
      ADD CONSTRAINT gfa_billing_review_status_check
      CHECK (billing_review_status IS NULL OR billing_review_status IN ('pending','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gfa_billing_review_grund_check') THEN
    ALTER TABLE public.gutachter_finder_anfragen
      ADD CONSTRAINT gfa_billing_review_grund_check
      CHECK (billing_review_grund IS NULL OR billing_review_grund IN ('kunde_absage','kunde_no_show'));
  END IF;
END $$;

COMMENT ON COLUMN public.gutachter_finder_anfragen.abrechnung_sv_id IS 'AAR-939: eingefrorener SV (sachverstaendige.id) zum Anfrage-Zeitpunkt — verhindert SV-Wanderung bei Site-Ownerwechsel vor Abrechnung.';
