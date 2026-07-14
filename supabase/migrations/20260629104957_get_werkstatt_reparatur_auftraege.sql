-- Outbound-Werkstatt-Seite: die einer Werkstatt zur Reparatur ZUGEWIESENEN Auftraege
-- (claims.reparatur_werkstatt_id, gesetzt vom Finder/Dispatcher der Session 4e248a04).
-- Self-scoped via auth.uid() (wie get_werkstatt_vermittlungen). Leak-safe: curated,
-- KEIN Kunden-Kontakt (Kunde wird via #3302 mit Werkstatt-Info benachrichtigt -> Kunde initiiert).
CREATE OR REPLACE FUNCTION public.get_werkstatt_reparatur_auftraege()
 RETURNS TABLE(claim_id uuid, kunde_name text, fahrzeug text, kennzeichen text, ort text, quelle text, zugewiesen_am timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id AS claim_id,
    NULLIF(btrim(concat_ws(' ', l.vorname, l.nachname)), '') AS kunde_name,
    NULLIF(btrim(concat_ws(' ', l.fahrzeug_hersteller, l.fahrzeug_modell,
      CASE WHEN l.fahrzeug_baujahr IS NOT NULL THEN '(' || l.fahrzeug_baujahr || ')' END)), '') AS fahrzeug,
    l.kennzeichen,
    c.schadenort_ort AS ort,
    c.reparatur_werkstatt_quelle AS quelle,
    c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am
  FROM public.claims c
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.reparatur_werkstatt_id = (SELECT w.id FROM public.werkstaetten w WHERE w.user_id = auth.uid())
  ORDER BY c.reparatur_werkstatt_zugewiesen_am DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.get_werkstatt_reparatur_auftraege() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_werkstatt_reparatur_auftraege() TO authenticated;
