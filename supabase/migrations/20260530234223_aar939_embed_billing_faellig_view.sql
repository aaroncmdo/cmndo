-- AAR-939 Stream 8 (B1): AUTO-FÄLLIG-Billing.
-- (1) Toten gfa.status-Trigger droppen — im neuen Modell setzt NIEMAND mehr
--     abrechnungs_relevant; Faelligkeit ergibt sich aus Terminzeit+Status (View unten).
-- (2) View v_embed_billing_faellig kapselt die 8 Faellig-Regeln (Contract 31.05.):
--     Monika-B-Anfrage -> konvertiert_zu_lead_id -> claims(lead_id) -> gutachter_termine
--     (claim_id ODER lead_id), end_zeit+24h verstrichen, Status nicht in Ausnahmeliste,
--     SA unterschrieben, nicht abgerechnet/storniert/in-Review. DISTINCT ON nimmt den
--     juengsten gueltigen Termin (verschoben -> neuer zaehlt).
--     sv_no_show_am ist BEWUSST KEIN Ausschluss (Anti-Gaming: SV-No-Show zahlt trotzdem).
DROP TRIGGER IF EXISTS embed_anfrage_billing ON public.gutachter_finder_anfragen;
DROP FUNCTION IF EXISTS public.tg_embed_anfrage_billing();

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
  AND gt.status NOT IN ('abgesagt','storniert','verschoben','verlegt','verlegung_pending')
ORDER BY gfa.id, gt.end_zeit DESC;

COMMENT ON VIEW public.v_embed_billing_faellig IS 'AAR-939 Stream 8: faellige Monika-Embed-B-Vermittlungsentgelte (70 EUR). Eine Zeile pro abrechenbarer Anfrage mit aufgeloestem/eingefrorenem sv_id + betrag_netto. Gelesen vom Cron embed-abrechnung-erstellen.';
