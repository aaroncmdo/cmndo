-- AAR-939 Stream 8 (B1-Korrektur): Faellig-View auf VERBINDLICHE Termin-Status
-- einschraenken (Contract-Punkt 2 — nur ein verbindlicher Termin loest €70 aus).
-- Vorher Exclusion-Liste (liess 'reserviert'/'gegenvorschlag'/'sv_gesucht' durch ->
-- haette einen nie bestaetigten Termin mit vergangener end_zeit faelschlich
-- abgerechnet). Jetzt Inclusion: nur 'bestaetigt' (SV hat zugesagt -> Anti-Gaming:
-- SV-No-Show bleibt 'bestaetigt' und zahlt trotzdem) + 'durchgefuehrt' (explizit
-- abgeschlossen). 'reserviert'/'gegenvorschlag'/'sv_gesucht' = nicht verbindlich;
-- 'abgesagt'/'storniert'/'verschoben'/'verlegt'/'verlegung_pending'/'abgelehnt' =
-- kein stattgefundener Termin. sv_no_show_am bleibt BEWUSST kein Ausschluss.
CREATE OR REPLACE VIEW public.v_embed_billing_faellig
WITH (security_invoker = true) AS
SELECT DISTINCT ON (gfa.id)
  gfa.id                                                       AS anfrage_id,
  gfa.vorname,
  gfa.nachname,
  gfa.schadentyp,
  gfa.erstellt_am,
  gfa.embed_site_id,
  COALESCE(gfa.abrechnung_sv_id, es.sv_id)                     AS sv_id,
  COALESCE(gfa.abrechnungs_betrag_eur, es.einzelpreis_eur, 70) AS betrag_netto,
  es.name                                                      AS site_name,
  gt.id                                                        AS termin_id,
  gt.end_zeit                                                  AS termin_end_zeit
FROM public.gutachter_finder_anfragen gfa
JOIN public.embed_sites es     ON es.id = gfa.embed_site_id
JOIN public.claims c           ON c.lead_id = gfa.konvertiert_zu_lead_id
JOIN public.gutachter_termine gt
     ON (gt.claim_id = c.id OR gt.lead_id = gfa.konvertiert_zu_lead_id)
WHERE gfa.source = 'sv_embed'
  AND gfa.variante = 'B'
  AND gfa.abrechnung_id IS NULL
  AND gfa.abrechnung_storniert_am IS NULL
  AND gfa.billing_review_status IS DISTINCT FROM 'pending'
  AND c.sa_unterschrieben = true
  AND es.sv_id IS NOT NULL
  AND gt.end_zeit IS NOT NULL
  AND gt.end_zeit + interval '24 hours' < now()
  AND gt.status IN ('bestaetigt', 'durchgefuehrt')
ORDER BY gfa.id, gt.end_zeit DESC;
