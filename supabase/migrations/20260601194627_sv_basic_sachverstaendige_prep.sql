-- SV Basic-Tier P0: sachverstaendige fuer Basic vorbereiten (additiv).
-- recorded version 20260601194627.
-- Befund Live-Schema: paket = NOT NULL ohne CHECK (=> 'basic' braucht keine
--   Constraint-Aenderung); zahlungsempfaenger_iban existiert NICHT (=> moot).
-- Nur: onboarding_quelle + verifizierung_status um 'abgelehnt' (P3 Reject).

ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS onboarding_quelle text;

-- verifizierung_status um 'abgelehnt' erweitern (bestehende Definition 1:1 + neuer Wert).
ALTER TABLE public.sachverstaendige DROP CONSTRAINT IF EXISTS sachverstaendige_verifizierung_status_check;
ALTER TABLE public.sachverstaendige
  ADD CONSTRAINT sachverstaendige_verifizierung_status_check
  CHECK ((verifizierung_status IS NULL) OR (verifizierung_status = ANY (ARRAY['ausstehend'::text, 'geprueft'::text, 'frist_ueberschritten'::text, 'abgelehnt'::text])));

COMMENT ON COLUMN public.sachverstaendige.onboarding_quelle IS 'self_service_claim | self_service_neu | admin -- Herkunft des SV-Accounts (P1+).';
