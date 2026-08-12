# Dual-SSoT Signing Collapse + work_state-Konsolidierung Implementation Plan
> # ✅ UEBERHOLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> Die `work_state`-Konsolidierung ist vollzogen — nicht per Collapse wie geplant, sondern durch
> den **Drop der Spalte**: `claims.work_state` existiert auf prod **nicht mehr**
> (DB-verifiziert 12.08.). Damit gibt es keinen Dual-SSoT mehr, den man zusammenlegen koennte;
> der verbliebene Status-SSoT ist `operative_status` mit genau einem Writer (C1/#5114, Ratchet 0/0).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree (`node scripts/new-session-worktree.mjs flag-fg6-dual-ssot staging`).
> **Depends on:** FG1 (for Part B only). Part A is independent and buildable now.

**Goal:** Collapse the dual-SSoT signing facts (SA/Vollmacht stored on BOTH `claims` AND `leads`) to ONE canonical source per event with consistent reads across the two derived layers (`getClaimLifecycle` vs `resolveSubphase`), following the K3 event-timestamp+`IS NOT NULL`-derive pattern; and separately PRESENT (not execute) the still-open `work_state` vs `operative_status` consolidation as a decision-gate.

**Architecture:** Part A picks **claim = canonical POST-conversion, lead = canonical PRE-conversion** (a claim row only exists after conversion; every claim/portal/SV reader + both reminder crons already read the claim copy). A shared pure helper `readClaimSigningState(claim, lead)` derives the SA/Vollmacht booleans+timestamps from the right copy (claim if present, else lead) via `IS NOT NULL`. The lone divergence-prone reader — `getClaimLifecycle`, which today reads the LEAD copy while its sibling `resolveSubphase` reads the CLAIM copy — is migrated onto the claim copy so both derived layers agree. Only the one genuinely-redundant, zero-reader column `leads.sa_datum` is retired, reader-first (migrate its 2 writers first, DROP in a strictly-later task). Part B is a BLOCKED-ON-DECISION analysis: keep 3 axes (`status`/`operative_status`/`work_state`) or fold `work_state` into `operative_status` — needs Aaron + the ops-state lane; a conditional migration outline is included but NO concrete DROP tasks are written.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Never push to `main`; feature branch `kitta/aar-<nr>-<slug>` (or the worktree branch), PR against `staging`, merge after review (AGENTS.md Regel 1).
- DDL ONLY via `mcp__plugin_supabase_supabase__apply_migration({name,query})` → `list_migrations` (read the plugin-assigned `<V>`) → commit `supabase/migrations/<V>_<name>.sql` (filename == tracked version) → verify via `execute_sql` (READ-only). NEVER supabase-CLI `db push`; NEVER raw `execute_sql` with a DDL payload. Project ref = `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY).
- **Anti-landmine sequencing (reader-first):** migrate every reader/writer off a column + land + deploy FIRST; DROP the column only in a strictly-later task/PR. The repo had a `vollmacht_unterschrieben` / `faelle.vollmacht_datum` dropped-column incident (see `flow/[token]/actions.ts:1539`) — do not repeat it.
- Server-actions return `{ ok: boolean; error?: string }` (no throw) + `revalidatePath` on mutation. **Exception:** `confirmVollmacht` (`flow/[token]/actions.ts:1496`) is a legacy flow function returning `Promise<void>` — Part A does NOT change its signature (only adds a co-write inside it if a task requires; see Task 3 note).
- Never export non-function constants from a `'use server'` file (client bundle → `undefined`). The shared helper lives in a plain module (`src/lib/claims/signing-state.ts`), NOT in any `actions.ts`.
- No UI-facing strings change in this FG (backend/derivation only) → Umlaut rule is n/a; ASCII in comments/logs is fine.
- Every commit message ends with the 7-point `Audit:` block + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **file:line = Stand 2026-07-11 — RE-VERIFY by reading before each task** (the aar-956 lane actively edits `convert-lead-to-claim.ts` + `flow/[token]/actions.ts`).

---

## Context: verified facts (Stand 2026-07-11 — RE-VERIFY before each task)

### The dual-SSoT (spec §4.5 / §5.11), DB-confirmed
Signing columns exist on **both** tables (verified via `information_schema.columns`):

| fact | `claims` column(s) | `leads` column(s) |
|---|---|---|
| SA signed (bool) | `sa_unterschrieben` (bool), `sa_unterschrieben_am` (ts) | `sa_unterschrieben` (bool), `sa_unterschrieben_am` (ts), **`sa_datum` (ts, redundant twin)** |
| Vollmacht signed (ts) | `vollmacht_signiert_am` (ts) | `vollmacht_signiert_am` (ts), **`vollmacht_datum` (ts, CPA-billing)** |
| Vollmacht review | `vollmacht_status`, `vollmacht_geprueft_am` | — |
| SA evidence | `abtretung_pdf`, `abtretung_signiert_am`, `sa_pdf_url`, `sa_unterschrift_url` | — |

**The two derived layers read DIFFERENT copies of the same fact:**
- `getClaimLifecycle` (`src/lib/claims/lifecycle.ts:257-258`) reads the **LEAD** copy (`lead.sa_unterschrieben`, `lead.vollmacht_signiert_am`), fed by `get-claim-lifecycle-for-claim.ts:60-72` which queries `leads` via `claims.lead_id`.
- `resolveSubphase` (`src/lib/fall/subphase-resolver.ts:419` reads `claim.sa_unterschrieben_am`; `:413` reads `claim.vollmacht_status`/`vollmacht_geprueft_am`), fed by `subphase-resolver-input.ts:20-23` which queries `claims`.

→ Two sources for one fact; divergence risk if one write fails. Both are meant to be bit-parity with SQL views (`v_claim_phase`), so a divergence silently breaks the parity gate.

### The writers (dual-write in app code; NO DB backstop — verified: no trigger syncs these)
- `convert-lead-to-claim.ts:384-396` co-writes `claims.sa_unterschrieben(+_am)` + `abtretung_*` at claim creation (from `input.signatureUrl`). The lead copy is set by the caller (`signSAandCreateFall`).
- `flow/[token]/actions.ts:865-874` writes the **lead** copy (`sa_unterschrieben`, `sa_datum`, `sa_unterschrieben_am`); `:909-914` writes the **claim** copy (`sa_unterschrieben`, `sa_unterschrieben_am`) — same function, two `.update()` calls.
- `flow/[token]/actions.ts:1544-1556` (`confirmVollmacht`): `:1546` writes `claims.vollmacht_signiert_am`; `:1552` writes `leads.vollmacht_datum` (set-once, `.is('vollmacht_datum', null)`). Both non-fatal (error-logged). The comment at `:1537-1541` documents the earlier landmine (wrote `vollmacht_datum` onto non-existent `faelle.vollmacht_datum`).
- `kanzlei-wunsch/actions.ts:473/482` (`bestaetigeVollmachtKunde`): `:473` writes `claims.vollmacht_signiert_am`; `:482` writes `leads.vollmacht_signiert_am`.

No DB trigger currently syncs SA/Vollmacht between the tables (verified `pg_trigger` on `claims`+`leads`: only an unrelated `leads_whatsapp_invalidate`). **Today's 0-divergence is purely because the app dual-writes in the same function — a partial write silently diverges.**

### Live-data evidence (probe over 35 converted leads — `leads join claims on konvertiert_zu_claim_id`)
- `sa_unterschrieben` bool divergence claim↔lead: **0/35**; `vollmacht_signiert_am` presence divergence: **0/35** (dual-write holds today, but fragile).
- `leads.vollmacht_datum` set: **0/35** — the CPA-billing column is empty for every converted lead (the historical `faelle.vollmacht_datum` landmine + only-forward writes). Billing readers (`finance/abrechnungen-generator.ts:76-79`, `admin/finance/(hub)/page.tsx:720-730`) query `leads.vollmacht_datum` → CPA-on-Vollmacht billing currently reads an all-NULL column. **Flag as a follow-up, do NOT try to backfill in this FG** (needs the `confirmVollmacht`→claim event as source; out of scope, note only).
- `leads.sa_datum` set: **29/35** — but it has **ZERO readers** (Grep: only 2 write-sites `flow/[token]/actions.ts:869` + `create-test-fall/route.ts:87`, plus generated types). Genuinely-redundant twin of `sa_unterschrieben_am` → the one clean reader-first DROP candidate.

### Reader inventory (who reads which copy) — RE-VERIFY with Grep before Task 2/3
**Read the LEAD copy:**
- `lifecycle.ts:257-258` (via `get-claim-lifecycle-for-claim.ts:63`) — erfassung subphase **← the anomaly to fix (Task 3)**
- `autoPhase.ts:25` — lead auto-phase (`lead.sa_unterschrieben && lead.vollmacht_signiert_am`) — legit lead-native
- `analytics/conversion.ts:32` — funnel (`l.sa_unterschrieben`) — legit lead-native
- `finance/abrechnungen-generator.ts:78`, `admin/finance/(hub)/page.tsx:723/729` — CPA billing on `leads.vollmacht_datum` — legit lead/billing-native
- Dispatch lead views (`dispatch/leads/[id]/…`: `stammdaten.ts:100`, `dispatch-lead-felder.ts:33`, `page.tsx:126`, `DispatchStatusPanel.tsx:47`, `DispatchLeadForm.tsx:178`) — legit pre-conversion lead views

**Read the CLAIM copy:**
- `subphase-resolver.ts:413/419` (via `subphase-resolver-input.ts:21`)
- `get-kunde-faelle.ts:333/672`, `fall-karte-loader.ts:146`, `kunde/faelle/page.tsx`, `kunde/page.tsx`, `gutachter/fall/[id]/page.tsx:55`, `gutachter/auftraege/page.tsx:117/122` — read `claims.sa_unterschrieben` (via v_claim_full / claim embeds)
- `sla/blocker-detection.ts:70`, `google-calendar/sv-event-sync.ts:79` — `claims.sa_unterschrieben || claims.vollmacht_signiert_am`
- `api/cron/sa-reminder/route.ts:40-42` + `api/cron/vollmacht-reminder/route.ts:33-36` — read `v_claim_full.sa_unterschrieben_am` / `.vollmacht_signiert_am` (claim-based view)

**Conclusion — canonical decision (Part A):** the split is already coherent — lead-copy readers are pre-conversion lead/dispatch/billing/analytics; claim-copy readers are post-conversion claim/portal/SV/cron. **Canonical = claim POST-conversion, lead PRE-conversion.** The only inconsistency is `getClaimLifecycle` (a *claim* resolver) reading the *lead* copy. Fix that one read + introduce a shared derive-helper so future readers can't pick the wrong copy. `v_claim_full` already surfaces the claim copy (verified it projects `sa_unterschrieben(_am)`, `vollmacht_signiert_am`) → NO view change needed.

### `v_claim_full` note
`sa_unterschrieben`, `sa_unterschrieben_am`, `vollmacht_signiert_am` are projected from the claim side of `v_claim_full` (crons filter on them and get claim-consistent results). Part A does NOT modify `v_claim_full`.

### Test harness pattern
Pure-function tests: `src/lib/faelle/fall-status-claim-mapping.test.ts`. Lifecycle input tests: `src/lib/claims/lifecycle.test.ts` + `get-claim-lifecycle-for-claim.test.ts`. Queue-based Supabase builder mock: `src/lib/leads/__tests__/convert-lead-to-claim.test.ts:17-120`. Vitest config: `vitest.config.ts`. Single file: `npx vitest run <path>`.

### Coordination / file-overlap (PROMINENT)
- **`src/lib/leads/convert-lead-to-claim.ts`** — heavily used, **active aar-956 lane** (the current branch). Part A touches it only in Task 5 (SA co-write via the shared helper — additive, no behavior change) and NOT before the reader migration. RE-READ + rebase before editing.
- **`src/lib/claims/lifecycle.ts`** + **`src/lib/claims/get-claim-lifecycle-for-claim.ts`** — Part A Task 3 changes only the *input source* (lead→claim) for the two signing fields; the pure `getClaimLifecycle` logic + its `v_claim_phase` parity is preserved (the branch that consumes `lead.sa_unterschrieben`/`vollmacht_signiert_am` only fires in `erfassung`, where claim and lead agree by construction).
- **`src/lib/fall/subphase-resolver.ts`** — Part A does NOT change it (it already reads the claim copy = canonical). Coordinate with the subphase/ops lanes only for awareness.
- **`src/app/flow/[token]/actions.ts`** — active aar-956 lane; Task 3/5 touch it additively.
- **Part B depends on FG1** (which chose the trigger-backstop and deliberately did NOT consolidate `work_state`) — see Part B section; do not start Part B without the decision.
- Leave a coordination marker under `…/memory/` before starting (name it `COORDINATION-fg6-dual-ssot-signing.md`).

---

## File Structure

**Created:**
- `src/lib/claims/signing-state.ts` — plain module (NOT `'use server'`). The K3 derive-helper. Exports:
  - `type SigningStateInput` (claim-side + lead-side optional subsets)
  - `type ClaimSigningState` (`{ saUnterschrieben: boolean; saUnterschriebenAm: string | null; vollmachtSigniertAm: string | null }`)
  - `function readClaimSigningState(input): ClaimSigningState` — prefers the claim copy when a claim exists (any claim signing field present OR `hasClaim===true`), else the lead copy; derives bool via `IS NOT NULL`/truthy.
- `src/lib/claims/signing-state.test.ts` — vitest for the pure helper.
- `supabase/migrations/<V>_fg6_leads_sa_datum_drop.sql` — DROP of the zero-reader redundant `leads.sa_datum` (LAST task, reader-first — only after its 2 writers are migrated + landed).

**Modified:**
- `src/lib/claims/get-claim-lifecycle-for-claim.ts` — load the CLAIM signing copy (add `sa_unterschrieben, vollmacht_signiert_am` to the `claims` select at :55) and feed `getClaimLifecycle`'s `lead.*` input from `readClaimSigningState` (claim-preferred). No change to `getClaimLifecycle` itself.
- `src/app/flow/[token]/actions.ts` — Task 5: stop writing `leads.sa_datum` at :869 (drop that one key from the update; keep `sa_unterschrieben`+`sa_unterschrieben_am`). (`confirmVollmacht` left as-is functionally.)
- `src/app/api/admin/create-test-fall/route.ts` — Task 5: drop the `sa_datum` write at :87 (test fixture).

**Untouched (verified):** `src/lib/fall/subphase-resolver.ts` (+`-input.ts`), `src/lib/claims/lifecycle.ts` (pure logic), `v_claim_full`, all legit lead-copy readers (`autoPhase`, `analytics/conversion`, dispatch views, billing on `leads.vollmacht_datum`), `state-machine.ts`.

---

## Task 1 — Shared K3 signing-state derive-helper (pure function)

**Files:**
- Create: `src/lib/claims/signing-state.ts`
- Test: `src/lib/claims/signing-state.test.ts`

**Interfaces:**
- Produces:
  - `export type SigningStateInput = { hasClaim?: boolean; claim?: { sa_unterschrieben?: boolean | null; sa_unterschrieben_am?: string | null; vollmacht_signiert_am?: string | null } | null; lead?: { sa_unterschrieben?: boolean | null; sa_unterschrieben_am?: string | null; vollmacht_signiert_am?: string | null } | null }`
  - `export type ClaimSigningState = { saUnterschrieben: boolean; saUnterschriebenAm: string | null; vollmachtSigniertAm: string | null }`
  - `export function readClaimSigningState(input: SigningStateInput): ClaimSigningState`
- Consumes: nothing (pure).

**Semantics (canonical decision encoded):** if a claim exists (`hasClaim === true` OR `claim` is non-null with any signing field set), the CLAIM copy is authoritative; else the LEAD copy. `saUnterschrieben` is derived: `true` iff `saUnterschriebenAm != null` OR the chosen copy's bool is `true` (belt-and-suspenders — the bool and ts are co-written, but the ts is the K3 truth). This matches the `vollmacht_signiert_am` exemplar (`flow/[token]/actions.ts:1535` "Bool-Semantik aus IS NOT NULL abgeleitet").

**Steps:**
1. - [ ] Write failing test `src/lib/claims/signing-state.test.ts` (REAL code):
```ts
import { describe, it, expect } from 'vitest'
import { readClaimSigningState } from './signing-state'

describe('readClaimSigningState (FG6 dual-SSoT collapse, K3)', () => {
  it('prefers the CLAIM copy when a claim exists', () => {
    const s = readClaimSigningState({
      hasClaim: true,
      claim: { sa_unterschrieben: true, sa_unterschrieben_am: '2026-07-01T10:00:00Z', vollmacht_signiert_am: '2026-07-02T10:00:00Z' },
      lead: { sa_unterschrieben: false, sa_unterschrieben_am: null, vollmacht_signiert_am: null },
    })
    expect(s.saUnterschrieben).toBe(true)
    expect(s.saUnterschriebenAm).toBe('2026-07-01T10:00:00Z')
    expect(s.vollmachtSigniertAm).toBe('2026-07-02T10:00:00Z')
  })

  it('falls back to the LEAD copy pre-conversion (no claim)', () => {
    const s = readClaimSigningState({
      hasClaim: false,
      claim: null,
      lead: { sa_unterschrieben: true, sa_unterschrieben_am: '2026-06-01T10:00:00Z', vollmacht_signiert_am: null },
    })
    expect(s.saUnterschrieben).toBe(true)
    expect(s.saUnterschriebenAm).toBe('2026-06-01T10:00:00Z')
    expect(s.vollmachtSigniertAm).toBeNull()
  })

  it('derives saUnterschrieben from the timestamp (K3) even if the bool is missing', () => {
    const s = readClaimSigningState({ hasClaim: true, claim: { sa_unterschrieben: null, sa_unterschrieben_am: '2026-07-01T10:00:00Z' }, lead: null })
    expect(s.saUnterschrieben).toBe(true)
  })

  it('reports not-signed when neither copy has the fact', () => {
    const s = readClaimSigningState({ hasClaim: true, claim: {}, lead: null })
    expect(s).toEqual({ saUnterschrieben: false, saUnterschriebenAm: null, vollmachtSigniertAm: null })
  })

  it('treats a non-null claim with a signing field as authoritative even if hasClaim is unset', () => {
    const s = readClaimSigningState({
      claim: { vollmacht_signiert_am: '2026-07-05T10:00:00Z' },
      lead: { vollmacht_signiert_am: '2026-06-05T10:00:00Z' },
    })
    expect(s.vollmachtSigniertAm).toBe('2026-07-05T10:00:00Z')
  })
})
```
2. - [ ] Run to see it fail: `npx vitest run src/lib/claims/signing-state.test.ts` → **fail** (module missing).
3. - [ ] Minimal impl `src/lib/claims/signing-state.ts` (REAL code):
```ts
// FG6 (interaction-flags §5.11): collapse the dual-SSoT SA/Vollmacht signing facts.
//
// The signing events are stored on BOTH claims and leads. Canonical source
// (verified 2026-07-11): the CLAIM copy is authoritative POST-conversion (a claim
// row only exists after conversion; every claim/portal/SV reader + both reminder
// crons read the claim side); the LEAD copy is authoritative PRE-conversion (before
// a claim exists — dispatch lead views + funnel analytics). This helper derives the
// signing booleans from the right copy, K3-style (bool = timestamp IS NOT NULL),
// generalising the vollmacht_signiert_am exemplar (flow/[token]/actions.ts:1535).
//
// NOT a 'use server' file: this non-function export must stay importable by client +
// server without becoming undefined in the client bundle (AGENTS.md §use-server).

export type SigningCopy = {
  sa_unterschrieben?: boolean | null
  sa_unterschrieben_am?: string | null
  vollmacht_signiert_am?: string | null
}

export type SigningStateInput = {
  /** true when the claim row is known to exist (post-conversion). Optional: a
   *  non-null `claim` with any signing field set is also treated as authoritative. */
  hasClaim?: boolean
  claim?: SigningCopy | null
  lead?: SigningCopy | null
}

export type ClaimSigningState = {
  saUnterschrieben: boolean
  saUnterschriebenAm: string | null
  vollmachtSigniertAm: string | null
}

function copyHasAnySigning(c: SigningCopy | null | undefined): boolean {
  if (!c) return false
  return c.sa_unterschrieben === true || c.sa_unterschrieben_am != null || c.vollmacht_signiert_am != null
}

/** Pick the authoritative copy (claim post-conversion, lead pre-conversion) and
 *  derive the signing state. Bool is derived from the timestamp (K3). */
export function readClaimSigningState(input: SigningStateInput): ClaimSigningState {
  const claimAuthoritative = input.hasClaim === true || copyHasAnySigning(input.claim)
  const src: SigningCopy = (claimAuthoritative ? input.claim : input.lead) ?? {}
  const saUnterschriebenAm = src.sa_unterschrieben_am ?? null
  const vollmachtSigniertAm = src.vollmacht_signiert_am ?? null
  return {
    saUnterschriebenAm,
    vollmachtSigniertAm,
    saUnterschrieben: saUnterschriebenAm != null || src.sa_unterschrieben === true,
  }
}
```
4. - [ ] Run to pass: `npx vitest run src/lib/claims/signing-state.test.ts` → **5 passed**.
5. - [ ] Commit:
```
git add src/lib/claims/signing-state.ts src/lib/claims/signing-state.test.ts
git commit -m "$(cat <<'EOF'
feat(FG6): shared K3 signing-state derive-helper (claim/lead canonical pick)

readClaimSigningState picks the authoritative SA/Vollmacht copy (claim
post-conversion, lead pre-conversion) and derives the signed-bool from the
timestamp (K3). Code side of the dual-SSoT collapse; readers migrate next.

Audit:
- Build: gruen (npx vitest run signing-state.test.ts, 5 passed); tsc in Task 4
- UI: n/a (kein UI-Change)
- Redundanz: EINE Derive-Stelle statt ad-hoc lead-vs-claim-Reads pro Consumer
- Dead-Code: keiner (neues Modul)
- Spec: FG6 §5.11 — canonical = claim post-conversion / lead pre-conversion; K3 bool-aus-ts
- Inkonsistenz: Result-Shape rein; kein 'use server'-Export (Client-Bundle-safe)
- Regression: reine additive Datei, kein Consumer geaendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Prove the divergence with a failing lifecycle-input test (regression guard)

**Files:**
- Test: `src/lib/claims/get-claim-lifecycle-for-claim.test.ts` (extend; RE-READ first to match the existing mock style)

**Goal:** lock in that `getClaimLifecycleForClaim` derives the erfassung signing state from the CLAIM copy — the fact that is wrong today (it reads the lead copy). This test fails against current code and passes after Task 3.

**Interfaces:** consumes the exported `getClaimLifecycleForClaim(admin, fallId)`; asserts the resulting `lifecycle.subPhase` reflects the CLAIM signing copy when claim and lead disagree.

**Steps:**
1. - [ ] RE-READ `src/lib/claims/get-claim-lifecycle-for-claim.test.ts` + `get-claim-lifecycle-for-claim.ts` to confirm the current admin-mock shape (`resolveClaimId`, `claims` select, `leads` select, `getAlleAuftraege`, `getKanzleiFall`).
2. - [ ] Add a failing test: construct a fall where NO auftrag/kanzleiFall exists (→ erfassung branch), `claims.status = null`, the **claim** copy has `sa_unterschrieben = true` (+ `sa_unterschrieben_am` set) but the **lead** copy still has `sa_unterschrieben = false`. Mock `getAlleAuftraege → []`, `getKanzleiFall → null`, `resolveClaimId → 'claim-1'`, the `claims` select returns `{ status: null, lead_id: 'lead-1', service_typ: 'komplett', sa_unterschrieben: true, sa_unterschrieben_am: '2026-07-01T10:00:00Z', vollmacht_signiert_am: null }`, the `leads` select returns `{ sa_unterschrieben: false, vollmacht_signiert_am: null }`. Assert `bundle.lifecycle.subPhase === 'vollmacht_offen'` (i.e. SA IS considered signed → advanced past `sa_offen`). Today the loader reads the lead copy (`false`) → subPhase would be `sa_offen` → **test fails** = the divergence, proven.
   > If the existing test file's mock cannot express distinct claim vs lead select payloads, add a focused sibling test file `get-claim-lifecycle-for-claim.signing.test.ts` with a purpose-built mock rather than contorting the existing one; keep the assertion identical.
3. - [ ] Run to see it fail: `npx vitest run <that test>` → **fail** (`subPhase` is `sa_offen`, expected `vollmacht_offen`).
4. - [ ] (No commit yet — this red test is completed by Task 3. If your workflow requires a commit per step, commit the red test with `test(FG6): failing guard — lifecycle must read the claim signing copy` and an Audit block noting it is a deliberately-red TDD step finished in the next task.)

---

## Task 3 — Migrate `getClaimLifecycle`'s signing input onto the CLAIM copy (via the helper)

**Files:**
- Modify: `src/lib/claims/get-claim-lifecycle-for-claim.ts`
- Test: the Task 2 test (now goes green)

**Interfaces:** `getClaimLifecycleForClaim(admin, fallId)` — unchanged signature/return `ClaimLifecycleBundle`. Internal: the `lead` input passed to `getClaimLifecycle` is now derived by `readClaimSigningState({ hasClaim: !!claimId, claim: {sa_unterschrieben, sa_unterschrieben_am, vollmacht_signiert_am}, lead: {sa_unterschrieben, vollmacht_signiert_am} })`.

**Precise change (RE-VERIFY lines 52-74 first):**
- Add `sa_unterschrieben, vollmacht_signiert_am` to the `claims` select at ~:55 (currently `select('status, lead_id, service_typ')`).
- Keep the existing `leads` fetch (still needed as the pre-conversion fallback + for `onboarding_complete: null` shape).
- Replace the hand-built `lead = { sa_unterschrieben: leadRow.sa_unterschrieben, vollmacht_signiert_am: leadRow.vollmacht_signiert_am, onboarding_complete: null }` with:
```ts
const signing = readClaimSigningState({
  hasClaim: !!claimId,
  claim: {
    sa_unterschrieben: (claim?.sa_unterschrieben as boolean | null) ?? null,
    sa_unterschrieben_am: (claim?.sa_unterschrieben_am as string | null) ?? null,
    vollmacht_signiert_am: (claim?.vollmacht_signiert_am as string | null) ?? null,
  },
  lead: leadRow
    ? {
        sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
        vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
      }
    : null,
})
lead = { sa_unterschrieben: signing.saUnterschrieben, vollmacht_signiert_am: signing.vollmachtSigniertAm, onboarding_complete: null }
```
  (Keep `getClaimLifecycle`'s `ClaimLifecycleInput['lead']` shape exactly — `sa_unterschrieben: boolean | null`, `vollmacht_signiert_am: string | null`, `onboarding_complete: null`.)
- Import `readClaimSigningState` from `@/lib/claims/signing-state`.
- Update the stale comment at :15 (`sa_unterschrieben / vollmacht_signiert_am leben auf leads`) to reflect the canonical claim-first read.

**Steps:**
1. - [ ] RE-READ `get-claim-lifecycle-for-claim.ts:47-88`.
2. - [ ] Apply the change above.
3. - [ ] Run the Task 2 test to pass: `npx vitest run <that test>` → **pass** (subPhase `vollmacht_offen`). Also run the existing `npx vitest run src/lib/claims/lifecycle.test.ts src/lib/claims/get-claim-lifecycle-for-claim.test.ts` → all green (no regression; the `erfassung` branch is the only consumer of these fields, and claim==lead there today so existing fixtures are unaffected).
4. - [ ] Commit:
```
git add src/lib/claims/get-claim-lifecycle-for-claim.ts src/lib/claims/get-claim-lifecycle-for-claim.signing.test.ts
git commit -m "$(cat <<'EOF'
fix(FG6): getClaimLifecycle reads the CLAIM signing copy (dual-SSoT collapse)

get-claim-lifecycle-for-claim now derives SA/Vollmacht via readClaimSigningState
(claim-preferred), so getClaimLifecycle and resolveSubphase read the SAME copy
(both claim post-conversion). Removes the last divergence-prone signing read.
getClaimLifecycle logic + v_claim_phase parity untouched.

Audit:
- Build: gruen (npx vitest run lifecycle + get-claim-lifecycle-for-claim, green); tsc in Task 4
- UI: n/a (kein UI-Change)
- Redundanz: nutzt shared readClaimSigningState statt handgerolltem lead-Read
- Dead-Code: stale "leben auf leads"-Kommentar aktualisiert
- Spec: FG6 §5.11 — beide Derive-Layer lesen jetzt die claim-Copy (canonical)
- Inkonsistenz: ClaimLifecycleInput.lead-Shape unveraendert; Parity zu v_claim_phase erhalten (erfassung-Branch claim==lead)
- Regression: einziger Consumer der Felder ist der erfassung-Zweig; Bestandsfixtures unveraendert gruen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Full typecheck/build gate + reader-consistency verification

**Files:** none created.

**Steps:**
1. - [ ] `npx tsc --noEmit` → green. Then `npm run build` (route/loader consumers changed) → green.
2. - [ ] Run the FG6 suite: `npx vitest run src/lib/claims/signing-state.test.ts src/lib/claims/get-claim-lifecycle-for-claim.signing.test.ts src/lib/claims/lifecycle.test.ts src/lib/claims/get-claim-lifecycle-for-claim.test.ts` → all green.
3. - [ ] `execute_sql` (READ) re-confirm live parity holds after nothing-DB-changed-yet: re-run the divergence probe (Context section query) → still 0 bool/presence divergence. (This confirms Task 3 is a pure read-source change, no data effect.)
4. - [ ] Grep-audit the two CLAIM-copy resolver feeds are unchanged (`subphase-resolver-input.ts:21`) and that no NEW code reads `leads.sa_unterschrieben` for a post-conversion claim context. Document that `subphase-resolver.ts` was intentionally left (already canonical).

---

## Task 5 — Retire the genuinely-redundant zero-reader column `leads.sa_datum` (reader-first: migrate writers)

> **Reader-first, part 1 of 2.** This task migrates the 2 writers OFF `leads.sa_datum` and lands. The DROP is Task 6, a strictly-later PR/commit.

**Files:**
- Modify: `src/app/flow/[token]/actions.ts` (drop `sa_datum` key at ~:869)
- Modify: `src/app/api/admin/create-test-fall/route.ts` (drop `sa_datum` key at ~:87)

**Rationale:** `leads.sa_datum` is a redundant twin of `leads.sa_unterschrieben_am` (both set to the same `now` in `signSAandCreateFall`). Grep-verified **zero readers** anywhere in `src/` (only these 2 writers + generated types). Keeping `sa_unterschrieben_am` (the K3 timestamp) is sufficient. `claims.sa_datum` does not exist — nothing else depends on it.

**Steps:**
1. - [ ] RE-VERIFY zero readers: `Grep "sa_datum"` across `src/` → confirm still only `flow/[token]/actions.ts`, `api/admin/create-test-fall/route.ts`, and `database.types.ts`. If a NEW reader appeared (aar-956 churn), STOP and re-scope (migrate that reader to `sa_unterschrieben_am` first).
2. - [ ] In `flow/[token]/actions.ts` (~:865-874) remove `sa_datum: nowIsoSa,` from the `leads.update({...})` — keep `sa_unterschrieben: true`, `sa_unterschrieben_am: nowIsoSa`, and the other keys. Add a one-line comment: `// FG6: sa_datum retired (redundant twin of sa_unterschrieben_am; zero readers).`
3. - [ ] In `api/admin/create-test-fall/route.ts` (~:87) remove the `sa_datum: now,` key from the leads seed. (Keep `sa_unterschrieben` / `vollmacht_datum` etc. as-is.)
4. - [ ] `npx tsc --noEmit` → green (removing a write key cannot break types). Run any touched test suites (`npx vitest run` on flow/self-service tests if present).
5. - [ ] Commit (writers-off, column still present + typed):
```
git add src/app/flow/[token]/actions.ts src/app/api/admin/create-test-fall/route.ts
git commit -m "$(cat <<'EOF'
refactor(FG6): stop writing leads.sa_datum (redundant twin, zero readers)

leads.sa_datum duplicated leads.sa_unterschrieben_am (same now-value); grep
confirms zero readers in src/. Remove the 2 write-sites now; column DROP is the
strictly-later migration (reader-first).

Audit:
- Build: gruen (tsc --noEmit); no reader touched
- UI: n/a
- Redundanz: entfernt Doppel-Write (sa_datum == sa_unterschrieben_am)
- Dead-Code: 2 Write-Sites entfernt; Spalte bleibt bis Task 6 (reader-first)
- Spec: FG6 K3/K2 — nur der genuin redundante zero-reader-Twin wird retired
- Inkonsistenz: sa_unterschrieben_am bleibt die K3-Wahrheit
- Regression: 0 Reader (grep verifiziert) -> kein Consumer betroffen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — DROP `leads.sa_datum` via MCP (strictly LATER — after Task 5 landed + deployed)

> **Reader-first, part 2 of 2. Do NOT run this in the same PR as Task 5.** Land Task 5 to `staging` → merge → deploy → confirm no `sa_datum` write/read in prod logs, THEN drop. This spacing is the anti-landmine rule.

**Files:**
- Create (after MCP assigns version): `supabase/migrations/<V>_fg6_leads_sa_datum_drop.sql`

**Steps:**
1. - [ ] RE-VERIFY: `execute_sql` (READ) `SELECT count(*) FROM leads WHERE sa_datum IS NOT NULL;` (informational — the column dies regardless) AND re-Grep `src/` for `sa_datum` → must be ONLY `database.types.ts` (writers gone from Task 5). If any app reference remains, STOP.
2. - [ ] Author the DDL:
```sql
-- FG6: drop leads.sa_datum — redundant twin of leads.sa_unterschrieben_am (K3 truth),
-- zero readers (grep-verified), writers removed in the prior deploy. Reader-first.
alter table public.leads drop column if exists sa_datum;
```
3. - [ ] Apply via MCP: `apply_migration({ name: 'fg6_leads_sa_datum_drop', query: <DDL> })`.
4. - [ ] `list_migrations` → read the assigned `<V>`.
5. - [ ] Create `supabase/migrations/<V>_fg6_leads_sa_datum_drop.sql` with the exact DDL (filename == `<V>`).
6. - [ ] Verify: `execute_sql` (READ) `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='sa_datum';` → **0 rows**.
7. - [ ] Regenerate types (a column was dropped → a consumer type changes): `mcp__plugin_supabase_supabase__generate_typescript_types` → update `src/lib/supabase/database.types.ts` (removes the 3 `sa_datum` entries). `npx tsc --noEmit` → green.
8. - [ ] Commit:
```
git add supabase/migrations/<V>_fg6_leads_sa_datum_drop.sql src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
feat(FG6): DROP leads.sa_datum (reader-first, writers removed last deploy)

Redundant twin of leads.sa_unterschrieben_am; zero readers; writers already
removed + deployed (Task 5). Applied via MCP apply_migration; version <V>
assigned by plugin; file named to match. Types regenerated.

Audit:
- Build: gruen (tsc --noEmit nach types-regen); DDL via MCP verifiziert (column absent)
- UI: n/a
- Redundanz: letzte Kopie des SA-Datums-Twins entfernt
- Dead-Code: Spalte + 3 type-Entries weg
- Spec: FG6 — genuin redundante Spalte gedroppt, streng nach Reader-Migration (Task 5 -> Deploy -> Task 6)
- Inkonsistenz: sa_unterschrieben_am bleibt die Wahrheit
- Regression: 0 Reader (re-verifiziert vor Drop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Coordination marker + session-close

**Files:** `…/memory/COORDINATION-fg6-dual-ssot-signing.md` (marker note, not code).

**Steps:**
1. - [ ] Write the marker: FG6 Part A shipped — canonical decision (claim post-conversion / lead pre-conversion), shared `readClaimSigningState`, `getClaimLifecycle` migrated onto the claim copy, `leads.sa_datum` retired (reader-first). Note the open follow-ups (do NOT silently close): (a) `leads.vollmacht_datum` is all-NULL for converted leads → CPA-on-Vollmacht billing reads empty; needs a separate billing-lane fix sourcing from the `confirmVollmacht` event. (b) `leads.sa_unterschrieben` / `leads.vollmacht_signiert_am` / `leads.vollmacht_datum` are KEPT (legit pre-conversion + billing readers) — not dropped. (c) The 4 dual-write sites (`convert-lead-to-claim.ts:388`, `flow/actions.ts:865/909/1546/1552`, `kanzlei-wunsch/actions.ts:473/482`) still dual-write; a DB trigger backstop to guarantee claim↔lead parity is a possible future hardening but was NOT added here (0 live divergence; adding a trigger touches the active aar-956 lane's write-paths — defer).
2. - [ ] Flag the `convert-lead-to-claim.ts` / `flow/[token]/actions.ts` overlap for the aar-956 lane in the marker.
3. - [ ] Session-close (AGENTS.md Regel 3): `git status` clean; `git stash list` empty; `git log --branches --not --remotes` → all local commits pushed to the feature branch; open PR against `staging` (never `main`).

---

# PART B — `work_state` vs `operative_status` Konsolidierung  ⛔ BLOCKED-ON-DECISION

> **This part contains NO concrete DROP tasks.** It is an architectural decision that needs **Aaron + the ops-state lane (470d55c9)** to sign off, and it **depends on FG1**. FG1 chose the **trigger-backstop** (a `BEFORE UPDATE OF status` trigger that keeps `operative_status` in lock-step with terminal `status`) and **deliberately did NOT consolidate `work_state`** (FG1 plan §Global-Constraints + §Self-Review: "work_state/operative_status consolidation explicitly DEFERRED to FG6; no new work_state coupling added"). So the axis-count question is still open. Present the analysis + a CONDITIONAL migration outline that executes ONLY IF the decision is "consolidate".

## B.0 The three axes today (DB-verified)
| axis | CHECK (live) | meaning | writers | readers |
|---|---|---|---|---|
| `claims.status` | `NULL \| dispatch_done \| in_bearbeitung \| in_kommunikation_vs \| reguliert \| abgelehnt \| an_externe_kanzlei_uebergeben \| storniert \| reguliert_vollstaendig \| klage_rechtsstreit \| verjaehrt \| abgelehnt_final \| termin_durchgefuehrt` | lifecycle / terminal axis | `state-machine.ts`, `endzustand-actions.ts:106`, `kanzlei-wunsch/actions.ts:341/409/655` | `lifecycle.ts:171` (`v_claim_phase`), many |
| `claims.operative_status` | **NO CHECK** (FG1 adds one) | 19-value operational open/closed cursor (state-machine SSoT) | `state-machine.ts:197`, creators (`convert-lead-to-claim.ts:414`, `create-for-fall`, `sv-zuweisung/route`) | ~15 open/closed/billing filters |
| `claims.work_state` | `NULL \| dispatch_done \| in_bearbeitung` | narrow dispatch/processing axis | **only 2:** `convert-lead-to-claim.ts:370` (`'dispatch_done'`), `kanzlei-wunsch/actions.ts:575` (`'in_bearbeitung'`) | `endzustand-actions.ts:143` (VS-entry gate), `faelle/[id]/page.tsx:103` (`status ?? work_state` fallback), smoke/seed |

## B.1 What does `work_state` add over `operative_status`?
- **Semantically narrow:** `work_state` only ever holds `dispatch_done` (set at conversion) or `in_bearbeitung` (set when a KB picks up the case at kanzlei-wunsch time). It answers "has a human KB started actively processing this claim?" — a *processing-ownership* signal.
- **`operative_status`** answers "where in the operational pipeline is this claim?" (`ersterfassung` … `kanzlei-uebergeben` … `abgeschlossen`/`storniert`). It is the state-machine cursor.
- **The overlap:** `work_state = dispatch_done` roughly corresponds to `operative_status ∈ {ersterfassung, sv-*}` (dispatched, not yet actively KB-worked); `work_state = in_bearbeitung` corresponds to the KB having taken the case (which today is NOT represented as a distinct `operative_status` value — the closest is the claim sitting in `kanzlei-uebergeben`/`regulierung` cursor states).
- **The single hard dependency:** `endzustand-actions.ts:143` gates `markClaimAsInKommunikationVs` on `work_state === 'in_bearbeitung'` ("KB must be carrying the case before entering VS-communication"). This is the one place where `work_state` carries load `operative_status` cannot express as-is (there is no `operative_status` value meaning "KB actively carrying, pre-VS").

## B.2 Consolidation risk
- **The VS-entry gate would need a new predicate.** Folding `work_state` into `operative_status` means the `in_bearbeitung` gate at `endzustand-actions.ts:143` must be re-expressed against `operative_status` — but there is no current operative value for "KB actively carrying, pre-VS". You would have to either (a) add a new `operative_status` value (`in_bearbeitung` / `kb-aktiv`), which **collides with FG1's brand-new `claims_operative_status_check`** (FG1 restricts `operative_status` to the `FALL_STATUS_TRANSITIONS` keys — adding a processing-ownership value pollutes the pipeline axis with a non-pipeline concept), or (b) drop the gate's precondition, weakening the state guard.
- **`faelle/[id]/page.tsx:103`** reads `claimStatus = status ?? work_state` — a display fallback that treats `work_state` as a status stand-in when `status` is NULL. Consolidation must not regress this (it would become `status ?? operative_status`).
- **Touches the 470d55c9 engine lane** (`state-machine.ts` owns `operative_status`), and **stacks on FG1's freshly-added CHECK** — two moving pieces on the same column in flight.
- **Low upside, real churn:** only 2 writers + ~3 readers, and the axis is not a drift *source* (unlike the FG1 `status`/`operative_status` divergence). The spec ranks `work_state` as class **H (Fakt/legit)** with **Med** risk — not a bug, a modelling question.

## B.3 Options (for the decision)
- **Option K — Keep 3 axes (formalize `work_state`).** Add a `NOT NULL DEFAULT` or leave as-is; optionally document the 2-value semantics. Zero migration risk. The VS-gate stays crisp. This is the **status-quo + FG1's stance** (FG1 kept it deliberately). **Recommended default absent a strong reason to consolidate.**
- **Option C — Consolidate `work_state` → `operative_status`.** Requires: (1) a mapping of the 2 `work_state` values into (new or existing) `operative_status` values, (2) re-expressing the `:143` VS-entry gate, (3) migrating the `page.tsx:103` fallback, (4) reconciling with FG1's `claims_operative_status_check`, (5) a reader-first DROP of `work_state`. Only worth it if Aaron wants a single operational axis.

## B.4 CONDITIONAL migration outline — executes ONLY IF the decision is "Option C: consolidate"
> **DO NOT implement without the signed-off decision. This is an outline, not tasks.**
1. **Decide the target representation of `work_state=in_bearbeitung`.** Either introduce a dedicated boolean `claims.kb_aktiv` (cleanest — keeps the pipeline axis pure and does NOT fight FG1's CHECK), OR extend the `operative_status` CHECK with a processing value (NOT recommended — pollutes the pipeline axis). The `kb_aktiv` boolean is the likely least-risk landing.
2. **Reader-first, step 1:** re-express `endzustand-actions.ts:143` against the new representation (`kb_aktiv === true` or the chosen operative predicate) AND `faelle/[id]/page.tsx:103` fallback. Add the new column/value first (additive migration), backfill from current `work_state`, land + deploy.
3. **Writer migration:** repoint the 2 writers (`convert-lead-to-claim.ts:370`, `kanzlei-wunsch/actions.ts:575`) to set the new representation instead of `work_state`. Land + deploy.
4. **Only in a strictly-later PR:** DROP `claims.work_state` + its CHECK via MCP `apply_migration` (reader-first — after steps 2-3 are live and `work_state` has zero readers/writers), regen types.
5. **Guard:** a vitest proving the VS-entry gate still blocks when the KB has not taken the case, under the new representation.

**Gate to proceed:** written OK from Aaron + the 470d55c9 ops-state lane, AND FG1 merged (so the `operative_status` CHECK is known and the consolidation reconciles against it). Until then, Part B stays **BLOCKED-ON-DECISION** and the marker (Task 7) records it as open.

---

## Self-Review

**Spec coverage:**
- ✅ Part A canonical-source decision made **with evidence**: claim = canonical POST-conversion, lead = PRE-conversion (DB-verified reader split + 35-lead divergence probe + v_claim_full already claim-based). K3 pattern followed (bool derived from `IS NOT NULL`), generalizing the `vollmacht_signiert_am` exemplar.
- ✅ The concrete divergence (spec §5.11): `getClaimLifecycle` read the LEAD copy while `resolveSubphase` reads the CLAIM copy — fixed by migrating the lifecycle loader's signing input onto the claim copy via the shared helper (Task 3), proven by a red→green regression test (Task 2/3). `subphase-resolver.ts` left untouched (already canonical).
- ✅ Reader-first column retirement: only `leads.sa_datum` (zero-reader redundant twin) is dropped — writers migrated (Task 5) → land/deploy → DROP in a strictly-later task (Task 6). No other column dropped; `leads.sa_unterschrieben`/`vollmacht_signiert_am`/`vollmacht_datum` KEPT (legit pre-conversion/billing readers).
- ✅ Part B handled as a **decision-gate, NOT tasks**: analysis (what `work_state` adds — the `:143` VS-entry gate; its 2 writers + 3 readers), the consolidation risk (collides with FG1's new `operative_status` CHECK; touches 470d55c9), and a CONDITIONAL outline that runs ONLY IF "consolidate". Marked **BLOCKED-ON-DECISION**, depends on FG1.
- ✅ Coordination risks called out prominently (convert-lead-to-claim.ts + flow/[token]/actions.ts = active aar-956 lane; lifecycle.ts logic + v_claim_phase parity preserved).

**Placeholder scan:** No `TODO`/stub code. The only `<...>` tokens are the MCP-assigned migration version `<V>` in Task 6 (must be read from `list_migrations` at execution time — required by the DDL rule). All impl snippets (`signing-state.ts`, the loader edit, the write-site removals) are complete and runnable.

**Type consistency:** `readClaimSigningState` returns a fixed `ClaimSigningState`; the loader keeps `ClaimLifecycleInput['lead']`'s exact shape (`sa_unterschrieben: boolean | null`, `vollmacht_signiert_am: string | null`, `onboarding_complete: null`). Removing the `sa_datum` write keys cannot change types; the Task 6 DROP regenerates types (removes 3 `sa_datum` entries). No `'use server'` file exports a non-function const (helper is a plain module). Column names verified against live DB (`information_schema.columns`) + `database.types.ts`.

**Open follow-ups recorded (not silently closed):** (a) `leads.vollmacht_datum` all-NULL for converted leads → CPA-on-Vollmacht billing reads empty (separate billing lane). (b) 4 dual-write sites still dual-write (no DB parity trigger added — 0 live divergence, and a trigger would touch the active aar-956 write-paths → deferred). (c) Part B consolidation open.
