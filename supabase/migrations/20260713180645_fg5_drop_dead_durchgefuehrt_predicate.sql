-- FG5 Cluster 3: remove the DEAD 'durchgefuehrt' predicate from gutachter_termine.status consumers.
-- The gutachter_termine_status CHECK forbids 'durchgefuehrt' (valid completed state = 'abgeschlossen'),
-- so every `status = 'durchgefuehrt'` predicate matches 0 rows (verified count=0 on prod 2026-07-13).
-- Pure cleanup: removing a never-matching value cannot change result sets. Definitions reproduced
-- byte-for-byte from prod (pg_get_functiondef / pg_get_viewdef) minus 'durchgefuehrt'. View
-- security_invoker + grants preserved (CREATE OR REPLACE keeps them).

CREATE OR REPLACE FUNCTION public.get_aktueller_gt_termin_id(p_claim_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select gt.id
  from public.gutachter_termine gt
  where gt.claim_id = p_claim_id
    and gt.status = any (array['bestaetigt','verlegung_pending','reserviert','gegenvorschlag'])
  order by (case gt.status
      when 'bestaetigt' then 1
      when 'verlegung_pending' then 2
      when 'gegenvorschlag' then 3
      when 'reserviert' then 4
      else 6 end), gt.start_zeit desc nulls last
  limit 1
$function$;

CREATE OR REPLACE VIEW public.v_embed_billing_faellig
WITH (security_invoker = true) AS
 SELECT DISTINCT ON (gfa.id) gfa.id AS anfrage_id,
    gfa.vorname,
    gfa.nachname,
    gfa.schadentyp,
    gfa.erstellt_am,
    gfa.embed_site_id,
    COALESCE(gfa.abrechnung_sv_id, es.sv_id) AS sv_id,
    COALESCE(gfa.abrechnungs_betrag_eur, es.einzelpreis_eur, 70::numeric) AS betrag_netto,
    es.name AS site_name,
    gt.id AS termin_id,
    gt.end_zeit AS termin_end_zeit
   FROM gutachter_finder_anfragen gfa
     JOIN embed_sites es ON es.id = gfa.embed_site_id
     JOIN claims c ON c.lead_id = gfa.konvertiert_zu_lead_id
     JOIN gutachter_termine gt ON gt.claim_id = c.id OR gt.lead_id = gfa.konvertiert_zu_lead_id
  WHERE gfa.source = 'sv_embed'::text AND gfa.variante = 'B'::text AND gfa.abrechnung_id IS NULL AND gfa.abrechnung_storniert_am IS NULL AND gfa.billing_review_status IS DISTINCT FROM 'pending'::text AND c.sa_unterschrieben = true AND es.sv_id IS NOT NULL AND gt.end_zeit IS NOT NULL AND (gt.end_zeit + '24:00:00'::interval) < now() AND (gt.status = ANY (ARRAY['bestaetigt'::text]))
  ORDER BY gfa.id, gt.end_zeit DESC;
