-- CMM-21: Kunde darf seinen eigenen Termin lesen.
--
-- Vorher: gutachter_termine hatte SELECT-Policies für Admin/Staff/SV/Kanzlei,
-- aber keine für den Kunden — d.h. im Onboarding (Page-Loader liest mit
-- auth.uid() des Kunden) kam immer 0 Rows zurück, der Termin-Step zeigte
-- "Wir suchen gerade einen passenden Sachverständigen…" obwohl der Termin
-- längst auf 'bestaetigt' stand.
--
-- Analog zu fall_dokumente_kunde_read (AAR-739): Kunde sieht den Termin
-- wenn faelle.kunde_id = auth.uid() ODER der Kunde Party im zugehörigen
-- Claim ist (CMM-19 SSoT). Doppelt anlegen ist explizit gewollt — wir
-- befinden uns mitten in der faelle→claim Migration, beide Zugangswege
-- müssen funktionieren.

DROP POLICY IF EXISTS "gutachter_termine_kunde_read" ON public.gutachter_termine;

CREATE POLICY "gutachter_termine_kunde_read"
ON public.gutachter_termine
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM faelle f
    WHERE f.id = gutachter_termine.fall_id
      AND f.kunde_id = auth.uid()
  )
  OR (
    gutachter_termine.fall_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM faelle f2
      WHERE f2.id = gutachter_termine.fall_id
        AND f2.claim_id IS NOT NULL
        AND public.is_claim_user_party(f2.claim_id)
    )
  )
);

COMMENT ON POLICY "gutachter_termine_kunde_read" ON public.gutachter_termine IS
  'CMM-21: Kunde liest Termine seines Falls — via faelle.kunde_id ODER claim_parties (SSoT-Übergangsphase).';
