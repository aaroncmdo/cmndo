-- Werkstatt „Meine Vermittlungen" + Reparaturfreigabe.
-- claims-Freigabe-Marker (manuell durch admin/dispatch/KB) + leak-safer self-scoped
-- Lesepfad fuer Werkstaetten auf ihre eigenen KVA-Leads (nur kuratierte Spalten).

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS reparatur_freigegeben_am timestamptz,
  ADD COLUMN IF NOT EXISTS reparatur_freigegeben_von uuid;

-- Self-scoped (auth.uid() = Caller, auch unter SECURITY DEFINER): eine Zeile pro Lead
-- der Caller-Werkstatt, LEFT JOIN claim. Gibt NUR kuratierte Spalten zurueck (kein
-- Telefon/E-Mail). status abgeleitet: freigegeben > storniert > beauftragt > eingegangen.
CREATE OR REPLACE FUNCTION public.get_werkstatt_vermittlungen()
RETURNS TABLE (
  lead_id uuid, claim_id uuid, kunde_name text, fahrzeug text, kennzeichen text,
  kva_betrag numeric, erstellt_am timestamptz, status text, reparatur_freigegeben_am timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      WHEN c.id IS NOT NULL THEN 'beauftragt'
      ELSE 'eingegangen'
    END AS status,
    c.reparatur_freigegeben_am
  FROM public.leads l
  LEFT JOIN public.claims c ON c.lead_id = l.id
  WHERE l.werkstatt_id = (SELECT w.id FROM public.werkstaetten w WHERE w.user_id = auth.uid())
  ORDER BY l.created_at DESC;
$$;

-- Security: nur authenticated (self-scoped) + service_role; KEIN anon (Default-Privilege-Luecke).
REVOKE ALL ON FUNCTION public.get_werkstatt_vermittlungen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_werkstatt_vermittlungen() TO authenticated;
