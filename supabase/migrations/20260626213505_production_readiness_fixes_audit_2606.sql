-- Production-Readiness-Fixes aus dem Full-App-Audit 26.06.

-- C2: sv_bestellungsurkunde_oebuv hatte malformed Regel {"sv_qualifikation_oebuv":true}
-- (kein "op"-Key -> ruleEvaluator wertet als immer-true -> wurde JEDEM SV gezeigt statt
-- nur oebuv-qualifizierten). An die quali-Geschwister (sv_bvsk/sv_ihk: op=truthy) angeglichen.
update public.dokument_katalog set
  freigeschaltet_wenn = '{"op":"truthy","field":"sv_qualifikation_oebuv"}'::jsonb,
  pflicht_wenn        = '{"op":"truthy","field":"sv_qualifikation_oebuv"}'::jsonb
where slot_id = 'sv_bestellungsurkunde_oebuv';

-- C1: apply_gutachten_ocr ist SECURITY DEFINER + war fuer anon/authenticated ausfuehrbar
-- -> eingeloggter/anon Aufrufer konnte mit fremder claim_id Gutachten-OCR-Daten ueberschreiben
-- (Claim-RLS umgangen). Alle 5 echten Caller nutzen service_role (createAdminClient) ->
-- EXECUTE auf service_role beschraenken.
revoke execute on function public.apply_gutachten_ocr(uuid, jsonb) from anon, authenticated, public;
grant execute on function public.apply_gutachten_ocr(uuid, jsonb) to service_role;

-- #6: verwaiste gutachter_termine (kein claim/lead/sv_lead, in der Vergangenheit) blockieren
-- Assignee-Slots (EXCLUDE-Constraint gutachter_termine_no_assignee_overlap). Stornieren
-- (kein Empfaenger -> keine Notification). WHERE-Bedingung statt hardcoded IDs (Regel 2).
update public.gutachter_termine set status='storniert', cancelled_at=now()
where claim_id is null and lead_id is null and sv_lead_id is null
  and status not in ('storniert','abgeschlossen','abgebrochen') and start_zeit < now();
