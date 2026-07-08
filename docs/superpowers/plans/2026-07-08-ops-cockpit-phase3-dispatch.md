# Ops-Cockpit Phase 3 — Dispatch (Lead-Cockpit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Bring the Dispatch role onto the same work-state cockpit pattern as claims (Phase 0–2), driven by the **lead-side** derived view `v_lead_workstate` and the existing (merged) `deriveLeadWorkflowState`. Foundation-first: ship the read-layer (view + loader + `LeadWorkItem`) safely; the dispatch cockpit UI follows (coordinated).

**Architecture (Approach C, lead side — STRICTLY separate from claims):**
- `v_lead_workstate` = `security_invoker=true` view over `leads` (leads has table-RLS `leads_staff_all_consolidated` → dispatch/admin see all; NO DEFINER gate fn needed, unlike v_claim_full). Projects `l.*` + the active SV-termin status + the latest flowlink timestamps — exactly the 3 inputs `deriveLeadWorkflowState(lead, aktiverTermin, flowlink)` needs.
- `getLeadWorkItems(supabase, {ownerId?})` reads the view, reconstructs the 3 inputs per row, calls `deriveLeadWorkflowState` → `LeadWorkItem` (`kind:'lead'`).
- **Lead-View ≠ Claim-View (Aaron, verbindlich):** `LeadWorkItem` is a SEPARATE discriminated-union member (`kind:'lead'`) from `ClaimWorkItem` (`kind:'claim'`). No lossy SQL UNION. A combined admin rollup keeps `kind` as a dimension (later).

**Tech Stack:** Next.js App Router, Supabase (security_invoker view over RLS'd `leads`), React, vitest (env=node + `renderToStaticMarkup`).

## Global Constraints
- **security_invoker=true** on `v_lead_workstate` (respect leads RLS; do NOT DEFINER-bypass). Verify `audit_ungated_definer_views()` stays 0 (invoker view is not flagged; has `lead_id` not `claim_id` so `audit_claim_views_leaking_to_nobody()` is out of scope — but re-verify both =0 after apply).
- **Consume, don't duplicate** `deriveLeadWorkflowState` + `computeQualificationStatus` (merged: `src/app/dispatch/leads/[id]/_lib/`). Do NOT re-derive qualification.
- DDL only via Supabase plugin `apply_migration`; commit the file named by the tracked version (Regel 2).
- Colors via `src/lib/status` registry (`lead-workflow` domain already exists); primitives/shared components; UI Umlauts; `{ok,error}` result objects; `rounded-ios-*`.

## ⚠️ COORDINATION DECISION (resolve before Task 2)
`deriveLeadWorkflowState` + `qualification-engine` live in **`src/app/dispatch/leads/[id]/_lib/`** (dispatch app domain — HOT: active sessions on lead-adjacent branches). The claim analog (`deriveClaimWorkflowState`) lives in `src/lib/ops/`. Two options for the loader/types placement:
- **(A) Keep the derivation where it is; put `getLeadWorkItems` + `LeadWorkItem` in `src/app/dispatch/_lib/`** (app→app import, no lib→app smell). Lowest collision surface, but the ops read-layer is then split across `src/lib/ops` (claims) and `src/app/dispatch/_lib` (leads).
- **(B) Move `deriveLeadWorkflowState` + `qualification-engine` to `src/lib/ops/` (lead-workflow.ts)**; re-export from the old path for the detail page. Unifies the read-layer, but touches the dispatch session's files → **must be coordinated** with the dispatch-leads owner (marker [[coordination-dispatch-leads-workflow-rebuild]]).
- **Recommendation: (A)** for the foundation (isolated, shippable now); revisit (B) as a later consolidation once the dispatch lanes settle. **Do not execute (B) without coordinating.**

---

### Task 1: `v_lead_workstate` view (foundation)

**Files:** Create `supabase/migrations/<tracked>_v_lead_workstate.sql` (apply via plugin first).

**DDL:**
```sql
create view public.v_lead_workstate with (security_invoker = true) as
select
  l.*,                                   -- all lead cols incl. LeadLike fields + zugewiesen_an + status
  t.status      as termin_status,        -- active SV-termin (Q5) status, else null
  f.gesendet_am as fl_gesendet_am,
  f.geoeffnet_am as fl_geoeffnet_am,
  f.abgeschlossen_am as fl_abgeschlossen_am,
  f.fall_id     as fl_fall_id
from public.leads l
left join lateral (
  select gt.status from public.gutachter_termine gt
  where gt.lead_id = l.id and gt.status in ('reserviert','bestaetigt')
  order by gt.start_zeit desc nulls last limit 1
) t on true
left join lateral (
  select fl.gesendet_am, fl.geoeffnet_am, fl.abgeschlossen_am, fl.fall_id
  from public.flow_links fl where fl.lead_id = l.id
  order by fl.erstellt_am desc nulls last limit 1
) f on true
where coalesce(l.disqualifiziert, false) = false
  and coalesce(l.status,'') not in ('umgewandelt','umgewandelt-sv','disqualifiziert','kalt')
  and coalesce(l.qualifizierungs_phase,'') not in ('konvertiert','abgeschlossen','kalt','disqualifiziert');

revoke all on public.v_lead_workstate from anon;
grant select on public.v_lead_workstate to authenticated;
```

- [ ] Apply via `apply_migration({name:'v_lead_workstate', query})`.
- [ ] `list_migrations` → read tracked version → commit file `supabase/migrations/<version>_v_lead_workstate.sql`.
- [ ] Verify (READ): `select count(*) from audit_ungated_definer_views()` = 0 AND `audit_claim_views_leaking_to_nobody()` = 0; simulate a dispatcher (`set request.jwt.claims` + `set local role authenticated`) → view returns their scoped active leads. Simulate admin → sees all active leads.

### Task 2: `LeadWorkstateRow` + `LeadWorkItem` types

**Files:** Create `src/app/dispatch/_lib/lead-workstate.types.ts` (per COORDINATION option A).

**Interfaces (Produces):**
```ts
export interface LeadWorkstateRow {
  id: string
  zugewiesen_an: string | null
  vorname: string | null; nachname: string | null; telefon: string | null
  status: string | null; qualifizierungs_phase: string | null
  disqualifiziert: boolean | null; sa_unterschrieben: boolean | null
  rueckruf_geplant_am: string | null; letzter_anruf_status: string | null; anruf_versuche: number | null
  created_at: string | null; updated_at: string | null
  termin_status: string | null
  fl_gesendet_am: string | null; fl_geoeffnet_am: string | null; fl_abgeschlossen_am: string | null; fl_fall_id: string | null
  // + all qualification-engine LeadLike fields (index-signature or explicit) — see qualification-engine.ts LeadLike
  [k: string]: unknown
}
export interface LeadWorkItem {
  kind: 'lead'
  id: string
  ownerId: string | null            // leads.zugewiesen_an (dispatch owner)
  state: import('@/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState').LeadWorkflowState
  qualCompleted: number             // qual.completedCount (of 8)
  display: { title: string; telefon: string | null }
}
```
- [ ] The `LeadWorkstateRow` must carry every field `WorkflowLeadLike` (deriveLeadWorkflowState.ts) + `LeadLike` (qualification-engine.ts) read. Because the view is `l.*`, an index signature `[k:string]:unknown` + the explicit workflow fields is acceptable; cast to `WorkflowLeadLike` at the call site.

### Task 3: `getLeadWorkItems` loader

**Files:** Create `src/app/dispatch/_lib/get-lead-workitems.ts`, Test `…/get-lead-workitems.test.ts`.

**Interface (Produces):**
```ts
export async function getLeadWorkItems(
  supabase: SupabaseClient,
  opts: { ownerId?: string },
): Promise<{ ok: true; items: LeadWorkItem[] } | { ok: false; error: string }>
```
- [ ] Reads `v_lead_workstate` (user-context → RLS). If `opts.ownerId`, `.eq('zugewiesen_an', ownerId)`.
- [ ] Per row: build `lead = row as WorkflowLeadLike`, `aktiverTermin = row.termin_status ? { status: row.termin_status } : null`, `flowlink = row.fl_gesendet_am||row.fl_geoeffnet_am||row.fl_abgeschlossen_am||row.fl_fall_id ? { gesendet_am: row.fl_gesendet_am, geoeffnet_am: row.fl_geoeffnet_am, abgeschlossen_am: row.fl_abgeschlossen_am, fall_id: row.fl_fall_id } : null`.
- [ ] `const { state, qual } = deriveLeadWorkflowState(lead, aktiverTermin, flowlink)` → map to `LeadWorkItem` (`title = [vorname,nachname].filter(Boolean).join(' ') || telefon || id`).
- [ ] Result object; on error `{ok:false}`.
- [ ] Test (mock supabase): a row with a sent-but-unopened flowlink → `state:'nachfassen'`; a fully-qualified row w/o link → `state:'flowlink_senden'`; DB error → `{ok:false}`.

---

## Phase 3b — Dispatch cockpit UI (DEFERRED, coordinated)
Once the foundation lands + the dispatch lanes settle: a dispatch rollup (by `state` × owner, or reuse `v_ops_rollup` extended with `kind`) + a lead work board (mirrors `MeineArbeitBoard`, but grouped by `LeadWorkflowState` not phase) + wiring into `/dispatch`. This touches `src/app/dispatch/**` (HOT) → coordinate with the active dispatch/leads sessions before building. Not in this foundation PR.

## Self-review
- Lead-View strictly separate from claim-view (kind discriminant) ✓; consumes the merged derivation ✓; security_invoker respects leads RLS (no new gate fn) ✓; foundation isolated in `src/app/dispatch/_lib` (option A) ✓; dispatch UI deferred to coordination ✓.
- Open coordination item: the (A) vs (B) placement of the derivation — recommend A now, B later with the dispatch owner.
