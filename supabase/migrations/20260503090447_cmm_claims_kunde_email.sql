-- CMM: Direkte E-Mail-Adresse auf claims (Kunde)
--
-- Bisher lag die Kunden-Email nur in claim_parties.email (JOIN nötig) und
-- auf faelle.kunde_email (Bridge-Tabelle). Für claim-zentrischen Datenzugriff
-- (Kanzleipaket, Ownership-Check, Email-Versand) brauchen wir das Feld direkt
-- auf claims — ohne Umweg über claim_parties oder faelle.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS kunde_email TEXT;

-- Backfill aus claim_parties (erste Party mit rolle='geschaedigter' + Email)
UPDATE public.claims c
SET    kunde_email = (
  SELECT cp.email
  FROM   claim_parties cp
  WHERE  cp.claim_id = c.id
    AND  cp.rolle    = 'geschaedigter'
    AND  cp.email   IS NOT NULL
  ORDER BY cp.reihenfolge ASC
  LIMIT 1
)
WHERE c.kunde_email IS NULL;

-- Auch aus faelle.kunde_email befüllen falls claim_parties leer war
UPDATE public.claims c
SET    kunde_email = f.kunde_email
FROM   public.faelle f
WHERE  f.claim_id   = c.id
  AND  c.kunde_email IS NULL
  AND  f.kunde_email IS NOT NULL;
