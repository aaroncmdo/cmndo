-- SV-Onboarding-Audit (2026-06-26): Doppelausstellungs-Schutz fuer Setup-Anzahlungs-
-- Rechnungen. Der Stripe-Webhook konnte bei gleichzeitiger Doppel-Zustellung eines
-- checkout.session.completed-Events zweimal createOnboardingRechnung aufrufen ->
-- zwei Rechnungen (frische fortlaufende rechnungs_nr) + zwei Mails. Eine Stripe-Session
-- = genau eine Anzahlung = genau eine Rechnung. Partieller Unique-Index erzwingt diese
-- natuerliche Invariante; createOnboardingRechnung gibt bei Insert-Konflikt bereits
-- { success:false } zurueck -> der Webhook-Caller ueberspringt dann die Mail.
-- Verifiziert: aktuell 0 doppelte stripe_session_id (4 Rechnungen, alle distinct).
CREATE UNIQUE INDEX IF NOT EXISTS sv_onboarding_rechnungen_stripe_session_uniq
ON public.sv_onboarding_rechnungen (stripe_session_id)
WHERE stripe_session_id IS NOT NULL;
