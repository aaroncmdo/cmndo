-- Zwischenstatus 'freigabe_ausstehend': Gutachten fertig, Reparaturfreigabe steht noch aus.
-- Additiv: LEFT JOIN gutachten (claim_id UNIQUE -> 1:1, keine Row-Multiplikation) + neuer CASE-Zweig
-- VOR 'beauftragt'. Output-Shape unveraendert.
CREATE OR REPLACE FUNCTION public.get_werkstatt_vermittlungen()
 RETURNS TABLE(lead_id uuid, claim_id uuid, kunde_name text, fahrzeug text, kennzeichen text, kva_betrag numeric, erstellt_am timestamp with time zone, status text, reparatur_freigegeben_am timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    l.id AS lead_id,
    c.id AS claim_id,
    NULLIF(btrim(concat_ws(' ', l.vorname, l.nachname)), '') AS kunde_name,
    NULLIF(btrim(concat_ws(' ', l.fahrzeug_hersteller, l.fahrzeug_modell,
      CASE WHEN l.fahrzeug_baujahr IS NOT NULL THEN '(' || l.fahrzeug_baujahr || ')' END)), '') AS fahrzeug,
    l.kennzeichen,
    COALESCE(l.kostenvoranschlag_brutto, l.kostenvoranschlag_netto) AS kva_betrag,
    l.created_at AS erstellt_am,
    CASE
      WHEN c.reparatur_freigegeben_am IS NOT NULL THEN 'reparatur_freigegeben'
      WHEN l.status IN ('disqualifiziert','kalt') THEN 'storniert'
      WHEN g.fertiggestellt_am IS NOT NULL THEN 'freigabe_ausstehend'
      WHEN c.id IS NOT NULL THEN 'beauftragt'
      ELSE 'eingegangen'
    END AS status,
    c.reparatur_freigegeben_am
  FROM public.leads l
  LEFT JOIN public.claims c ON c.lead_id = l.id
  LEFT JOIN public.gutachten g ON g.claim_id = c.id
  WHERE l.werkstatt_id = (SELECT w.id FROM public.werkstaetten w WHERE w.user_id = auth.uid())
  ORDER BY l.created_at DESC;
$function$;

-- ACL defensiv re-asserten (Staffelung-Lehre: kein anon/authenticated-Default-Grant)
REVOKE ALL ON FUNCTION public.get_werkstatt_vermittlungen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_werkstatt_vermittlungen() TO authenticated;
