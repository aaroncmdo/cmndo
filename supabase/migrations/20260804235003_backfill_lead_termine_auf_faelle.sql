-- Kunde-Termin-Funnel T1 Backfill: lead-verankerte Termine (bezug-nativ UND legacy)
-- bereits konvertierter Leads auf den Fall umhaengen (Spec 2026-08-05 §4.1;
-- bezug 'fall' == gelebte Achse, fall_id==claims.id claim-first). lead_id wird
-- genullt (validate-Trigger: kein Doppel-Bezug). Idempotent.
update gutachter_termine g
set bezug_typ = 'fall', bezug_id = c.id, lead_id = null
from claims c
where c.lead_id = coalesce(g.bezug_id, g.lead_id)
  and (g.bezug_typ = 'lead' or (g.bezug_typ is null and g.lead_id is not null))
  and g.status not in ('storniert','abgesagt','abgelehnt','abgeschlossen','verlegt');
