-- Kunden-Match + Ansprechpartner-Beziehung
--
-- Hintergrund: Wenn der Anrufer (Lead-Erfasser) NICHT der Halter ist, brauchen
-- wir die Beziehung zwischen Anrufer und Halter, damit der KB einschätzen
-- kann ob der Ansprechpartner berechtigt ist (Ehepartner, Mitarbeiter, Flotte
-- etc. — keine formelle Vollmacht, sondern Vertrauenskontext). Auch wichtig
-- für B2B (Mitarbeiter meldet Schaden für Firmenfahrzeug).
--
-- Außerdem: kunden_match_via auf faelle, damit wir transparent halten ob
-- ein Lead manuell einem bestehenden Kunden zugeordnet wurde (vs. neuer
-- Account beim Onboarding angelegt).

-- 1. claim_parties: Beziehung des Ansprechpartners zum Halter
ALTER TABLE public.claim_parties
  ADD COLUMN IF NOT EXISTS beziehung_zum_halter text;

COMMENT ON COLUMN public.claim_parties.beziehung_zum_halter IS
  'Beziehung des Ansprechpartners zum Halter wenn rolle != halter. '
  'Werte: ehepartner, familie, mitarbeiter, flotte_dispatcher, freund, '
  'sonstiges. Nur informativ — keine formelle Berechtigungsprüfung.';

-- 2. leads: gleiches Feld auf Lead-Ebene (vor Konversion)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ansprechpartner_beziehung text;

COMMENT ON COLUMN public.leads.ansprechpartner_beziehung IS
  'Wenn ist_fahrzeughalter=false: Beziehung des Anrufers (Ansprechpartner) '
  'zum Halter. Wandert beim Lead→Fall-Convert auf claim_parties.beziehung_zum_halter.';

-- 3. faelle: Match-Provenienz
ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS kunde_match_via text;

COMMENT ON COLUMN public.faelle.kunde_match_via IS
  'Wie wurde kunde_id gesetzt? Werte: neu (default — neuer Account beim '
  'Onboarding), dispatch_match (Dispatcher hat aus Match-Vorschlag gewählt), '
  'admin_manuell (Admin-Override). NULL = kunde_id noch nicht gesetzt.';

-- Index für Telefon-/E-Mail-Match auf claim_parties (für Kunden-Match-Loader)
CREATE INDEX IF NOT EXISTS idx_claim_parties_email_lower
  ON public.claim_parties (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claim_parties_telefon
  ON public.claim_parties (telefon)
  WHERE telefon IS NOT NULL;

-- Analog auf leads — für Reverse-Match (gibt es einen alten Lead von
-- diesem Kontakt?)
CREATE INDEX IF NOT EXISTS idx_leads_email_lower
  ON public.leads (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_halter_email_lower
  ON public.leads (lower(halter_email))
  WHERE halter_email IS NOT NULL;
