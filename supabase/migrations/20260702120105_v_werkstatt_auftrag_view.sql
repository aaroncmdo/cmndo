-- Werkstatt-Auftrag-View (Task 3/5): kanonische RLS-gegatete SSoT-View fuer die Werkstatt-Vermittlung.
-- Eine Zeile pro Claim; joint alle Entitaeten (minimierte PII: Kunde nur Name, Gutachter nur firmenname).
-- Gate: is_staff() OR is_werkstatt_for_claim(id) -> Werkstatt sieht nur eigene (beide Richtungen), Staff
-- alle, andere 0. KEIN security_invoker (laeuft als Owner, Gate = WHERE) — Muster der Claim-Views.
CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS
SELECT
  c.id AS claim_id,
  c.reparatur_vermittlung_status AS vermittlung_status,
  c.reparatur_werkstatt_quelle   AS quelle,
  c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am,
  CASE WHEN c.reparatur_werkstatt_id IS NOT NULL THEN 'vermittelt' ELSE 'inbound' END AS richtung,
  c.claim_nummer, c.schadenart, c.reparaturwunsch, c.status AS claim_status,
  v.hersteller AS fahrzeug_hersteller,
  NULLIF(concat_ws(' ', v.modell_haupttyp, v.modell_untertyp), '') AS fahrzeug_modell,
  v.kennzeichen_aktuell AS kennzeichen, v.fin,
  gt.start_zeit AS besichtigung_start, gt.besichtigungsort_adresse AS besichtigung_ort, gt.status AS besichtigung_status,
  sv.firmenname AS gutachter_firmenname,
  COALESCE(NULLIF(concat_ws(' ', p.vorname, p.nachname), ''), NULLIF(concat_ws(' ', l.vorname, l.nachname), '')) AS kunde_name,
  w.id AS werkstatt_id, w.name AS werkstatt_name, w.ansprechpartner_name AS werkstatt_ansprechpartner,
  wp.betrag_netto_eur AS provision_betrag_netto, wp.status AS provision_status
FROM public.claims c
LEFT JOIN public.claim_vehicle_involvements cvi ON cvi.claim_id = c.id AND cvi.rolle = 'geschaedigter'
LEFT JOIN public.vehicles v ON v.id = cvi.vehicle_id
LEFT JOIN LATERAL (
  SELECT t.start_zeit, t.besichtigungsort_adresse, t.status
  FROM public.gutachter_termine t
  WHERE t.claim_id = c.id AND t.typ = 'sv_begutachtung'
  ORDER BY t.start_zeit DESC NULLS LAST LIMIT 1
) gt ON true
LEFT JOIN public.sachverstaendige sv ON sv.id = c.sv_id
LEFT JOIN public.profiles p ON p.id = c.geschaedigter_user_id
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
LEFT JOIN public.werkstatt_provisionen wp ON wp.claim_id = c.id AND wp.werkstatt_id = w.id
WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL)
  AND (public.is_staff() OR public.is_werkstatt_for_claim(c.id));

REVOKE ALL ON public.v_werkstatt_auftrag FROM anon;
GRANT SELECT ON public.v_werkstatt_auftrag TO authenticated;
