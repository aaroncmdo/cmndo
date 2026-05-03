-- AAR-810 A.2.2: Safe-View für Cross-Party-Sicht
-- Beteiligter A sieht von Beteiligtem B nur Vorname + Rolle (DSGVO).
-- Eigene Daten gehen direkt über claim_parties (nicht über diese View).

CREATE OR REPLACE VIEW public.v_claim_parties_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  claim_id,
  rolle,
  reihenfolge,
  user_id,
  -- Vorname: OK für alle Co-Parties
  vorname,
  -- Nachname: nur Initiale für Co-Parties, voll für Staff + eigene
  CASE
    WHEN user_id = auth.uid() THEN nachname
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
      THEN nachname
    ELSE COALESCE(LEFT(nachname, 1) || '.', '')
  END AS nachname,
  firma,
  ist_gewerbe,
  -- Kontakt: nur eigene oder als Staff
  CASE
    WHEN user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
    THEN telefon
    ELSE NULL
  END AS telefon,
  CASE
    WHEN user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
    THEN email
    ELSE NULL
  END AS email,
  -- Adresse: nur eigene oder als Staff
  CASE
    WHEN user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
    THEN adresse_strasse
    ELSE NULL
  END AS adresse_strasse,
  -- Geburtsdatum: niemals cross-party, nur Staff oder eigene
  CASE
    WHEN user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
    THEN geburtsdatum
    ELSE NULL
  END AS geburtsdatum,
  -- Fahrzeugbezug: kennzeichen ist OK für alle (öffentlich am Unfallort)
  ist_halter,
  ist_fahrer,
  kennzeichen,
  fahrzeugtyp_klartext,
  vehicle_id,
  -- Versicherungsnummer: nur eigene oder Staff
  CASE
    WHEN user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rolle IN ('admin','dispatch','kundenbetreuer'))
    THEN versicherungsnummer
    ELSE NULL
  END AS versicherungsnummer,
  versicherung_id,
  -- Lifecycle
  ist_aktiv,
  ist_anonymisiert,
  -- Audit
  quelle,
  created_at,
  updated_at
FROM public.claim_parties;

COMMENT ON VIEW public.v_claim_parties_safe IS
  'AAR-810 A.2: DSGVO-konforme Cross-Party-Sicht. Eigene Daten + Staff sehen alles, andere Co-Parties nur Vorname + Initiale + öffentliche Felder (Kennzeichen, Versicherer-ID).';

GRANT SELECT ON public.v_claim_parties_safe TO authenticated;
