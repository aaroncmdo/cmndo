-- Werkstatt-Lead-Ansicht: schadentyp (das echte, CHECK-constrainte Schaden-Typ-Feld,
-- leads_schadentyp_check: 5 Werte) zusaetzlich exponieren. schadens_art (100% NULL, dead)
-- bleibt fuer CREATE-OR-REPLACE-Kompatibilitaet erhalten, wird aber nicht mehr gelesen.
CREATE OR REPLACE VIEW public.v_werkstatt_lead AS
 SELECT l.id,
    l.werkstatt_id,
    l.vorname,
    l.nachname,
    l.telefon,
    l.email,
    l.fahrzeug_hersteller,
    l.fahrzeug_modell,
    l.kennzeichen,
    l.fin,
    l.erstzulassung,
    l.schadens_art,
    l.schadens_hergang,
    l.unfalldatum,
    l.unfallort,
    l.kostenvoranschlag_netto,
    l.kostenvoranschlag_brutto,
    l.status::text AS status,
    l.created_at,
    l.schadentyp
   FROM public.leads l
  WHERE l.werkstatt_id IN (
      SELECT w.id FROM public.werkstaetten w WHERE w.user_id = (SELECT auth.uid())
    )
    AND l.konvertiert_zu_claim_id IS NULL;

REVOKE ALL ON public.v_werkstatt_lead FROM anon, authenticated;
GRANT SELECT ON public.v_werkstatt_lead TO authenticated;
