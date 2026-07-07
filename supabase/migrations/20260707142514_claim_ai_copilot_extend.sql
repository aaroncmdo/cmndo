-- Claim-AI-Konsole: additive Erweiterung des Orchestrator-Spine + ki_gespraeche.
-- quelle unterscheidet Copilot- von Orchestrator-Vorschlaegen; ausfuehrung_ergebnis
-- protokolliert die Hybrid-Ausfuehrung. vorschlag_typ erhaelt die Aktions-Verben
-- (task/escalation/next_step bleiben). ki_gespraeche erlaubt die admin-Rolle (Admin-Copilot).

alter table public.ai_claim_proposals
  add column if not exists quelle text not null default 'orchestrator',
  add column if not exists ausfuehrung_ergebnis jsonb;

alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_quelle_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_quelle_check
  check (quelle in ('orchestrator','copilot'));

alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_vorschlag_typ_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_vorschlag_typ_check
  check (vorschlag_typ in ('task','escalation','next_step','draft_message','add_note'));

alter table public.ki_gespraeche drop constraint if exists ki_gespraeche_rolle_check;
alter table public.ki_gespraeche add constraint ki_gespraeche_rolle_check
  check (rolle in ('kunde','kundenbetreuer','makler','admin'));
