-- AAR-kanzlei-portal: RLS-Policies so anpassen dass Kanzlei-Rolle alle Fälle
-- mit service_typ='komplett' sieht — nicht erst ab Status 'kanzlei-uebergeben'.
--
-- Begründung: Produkt-Entscheidung (Aaron 21.04.2026): Kanzlei soll volle
-- Transparenz haben ab dem Moment wo das Mandat existiert (SA signiert +
-- service_typ=komplett), damit sie bei Rückfragen vom Kunden sofort
-- Kontext haben. Read-only — Edit-Rechte bleiben bei Admin/KB.

DROP POLICY IF EXISTS "Kanzlei faelle" ON public.faelle;

CREATE POLICY "Kanzlei sieht komplett-Pakete"
ON public.faelle
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rolle = 'kanzlei'::user_role
  )
  AND service_typ = 'komplett'
);

DROP POLICY IF EXISTS "Kanzlei liest fall_dokumente" ON public.fall_dokumente;
CREATE POLICY "Kanzlei liest fall_dokumente"
ON public.fall_dokumente
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM faelle
    JOIN profiles ON profiles.id = auth.uid()
    WHERE faelle.id = fall_dokumente.fall_id
      AND profiles.rolle = 'kanzlei'::user_role
      AND faelle.service_typ = 'komplett'
  )
);

DROP POLICY IF EXISTS "Kanzlei liest gutachter_termine" ON public.gutachter_termine;
CREATE POLICY "Kanzlei liest gutachter_termine"
ON public.gutachter_termine
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM faelle
    JOIN profiles ON profiles.id = auth.uid()
    WHERE faelle.id = gutachter_termine.fall_id
      AND profiles.rolle = 'kanzlei'::user_role
      AND faelle.service_typ = 'komplett'
  )
);

DROP POLICY IF EXISTS "Kanzlei liest timeline" ON public.timeline;
CREATE POLICY "Kanzlei liest timeline"
ON public.timeline
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM faelle
    JOIN profiles ON profiles.id = auth.uid()
    WHERE faelle.id = timeline.fall_id
      AND profiles.rolle = 'kanzlei'::user_role
      AND faelle.service_typ = 'komplett'
  )
);

DROP POLICY IF EXISTS "Kanzlei liest konvertierte leads" ON public.leads;
CREATE POLICY "Kanzlei liest konvertierte leads"
ON public.leads
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM faelle
    JOIN profiles ON profiles.id = auth.uid()
    WHERE faelle.lead_id = leads.id
      AND profiles.rolle = 'kanzlei'::user_role
      AND faelle.service_typ = 'komplett'
  )
);
