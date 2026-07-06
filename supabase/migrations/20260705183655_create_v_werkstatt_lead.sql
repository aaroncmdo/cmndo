-- Werkstatt-Leads-Ansicht: die Werkstatt sieht + bearbeitet ihre eigenen OFFENEN
-- (noch nicht konvertierten) Inbound-Leads. DEFINER-View (wie v_werkstatt_auftrag,
-- reloptions=null = kein security_invoker) mit inline Ownership-Gate via auth.uid()
-- -> die Werkstatt sieht NUR ihre Leads. PII (Kunde/Kontakt) bewusst exponiert =
-- es sind die eigenen Kunden der Werkstatt (die sie bearbeiten darf).
CREATE OR REPLACE VIEW public.v_werkstatt_lead AS
SELECT
  l.id,
  l.werkstatt_id,
  l.vorname, l.nachname, l.telefon, l.email,
  l.fahrzeug_hersteller, l.fahrzeug_modell, l.kennzeichen, l.fin, l.erstzulassung,
  l.schadens_art, l.schadens_hergang, l.unfalldatum, l.unfallort,
  l.kostenvoranschlag_netto, l.kostenvoranschlag_brutto,
  l.status::text AS status,
  l.created_at
FROM public.leads l
WHERE l.werkstatt_id IN (
    SELECT w.id FROM public.werkstaetten w WHERE w.user_id = (SELECT auth.uid())
  )
  AND l.konvertiert_zu_claim_id IS NULL;

-- Pflicht-REVOKE gegen den anon-Leak (Lektion v_partner_billing) + gezielter Grant.
REVOKE ALL ON public.v_werkstatt_lead FROM anon, authenticated;
GRANT SELECT ON public.v_werkstatt_lead TO authenticated;

COMMENT ON VIEW public.v_werkstatt_lead IS
  'Werkstatt-Portal: eigene OFFENE (nicht konvertierte) Inbound-Leads. DEFINER-View, Gate werkstatt_id=auth.uid()-Werkstatt. Client-Reader fuer /werkstatt/anfragen (Leads-Bearbeitung).';
