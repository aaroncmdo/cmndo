-- CMM Entity (b2): externe Ansprechpartner-Rolle. Person die fuer eine Partei spricht (Firmen-AP
-- ODER z.B. "Bruder der besser Deutsch spricht") = personen + claim_parties.rolle='ansprechpartner'.
-- STRENG getrennt vom INTERNEN AP (Dispatcher/Kundenbetreuer = staff/profiles, KEINE claim_parties-Rolle).
ALTER TABLE public.claim_parties DROP CONSTRAINT claim_parties_rolle_check;
ALTER TABLE public.claim_parties ADD CONSTRAINT claim_parties_rolle_check
  CHECK (rolle = ANY (ARRAY[
    'geschaedigter'::text, 'verursacher'::text, 'fahrer_nicht_halter'::text, 'beifahrer'::text,
    'zeuge'::text, 'gegner_airdrop'::text, 'gutachter_gegen'::text, 'versicherungssachbearbeiter'::text,
    'halter'::text, 'ansprechpartner'::text]));

-- CMM Entity (a2): Kanzlei-Ansprechpartner als personen-Entitaet (spiegelt werkstaetten.ansprechpartner_person_id).
-- Loest die flachen claims.kanzlei_ansprechpartner_name/email/telefon ab (additiv, Legacy bleibt
-- bis Writer-Wiring; position bleibt Claim-Kontext). Das ist der EXTERNE Kanzlei-Kontakt, NICHT der interne.
ALTER TABLE public.claims
  ADD COLUMN kanzlei_ansprechpartner_person_id uuid REFERENCES public.personen(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.claims.kanzlei_ansprechpartner_person_id IS
  'CMM Entity (a2): Kanzlei-Ansprechpartner als personen-Entitaet (Name/Email/Telefon). Loest die flachen kanzlei_ansprechpartner_name/email/telefon ab (Legacy-Fallback bis Writer-Wiring; position bleibt Claim-Kontext). Spiegelt werkstaetten.ansprechpartner_person_id.';

CREATE INDEX idx_claims_kanzlei_ap_person_id ON public.claims (kanzlei_ansprechpartner_person_id);
