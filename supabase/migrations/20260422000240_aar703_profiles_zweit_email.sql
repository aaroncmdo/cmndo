-- AAR-703: profiles.zweit_email — sekundäre Kontakt-Email für Kunden.
-- Login-Identität bleibt profiles.email (= auth.users.email). Die zweit_email
-- ist eine zusätzliche Kontakt-Adresse, falls der Kunde eine zweite Mail
-- pflegen möchte (z.B. Backup, Familien-Zugang, Geschäftsmail).
-- Kein UNIQUE-Constraint — mehrere Kunden dürfen dieselbe zweit_email haben
-- (Familien-Inbox).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zweit_email TEXT;

COMMENT ON COLUMN public.profiles.zweit_email IS
  'AAR-703: Sekundäre Kontakt-Email (nur Kunden). Optional, kein UNIQUE.';
