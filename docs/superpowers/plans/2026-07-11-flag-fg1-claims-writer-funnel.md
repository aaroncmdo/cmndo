# claims Single-Writer-Funnel Implementation Plan
> # ✅ ERFUELLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> Ziel des Plans (`operative_status` hat genau EINEN Writer) ist erreicht — allerdings ueber das
> **Fundament-C1-Paket**, nicht ueber diesen Plan: `transitionFallStatus` ist der Funnel, die
> letzten 2 Direkt-Writer wurden mit **#5114** gehoben.
>
> **Beleg (12.08.):** `npm run check:operative-status-writes -- --ratchet` -> „OK — 0 bekannte
> Verletzer (Baseline 0), 0 neue" — das Gate ist scharf und leer. Zusaetzlich ist `claims.status`
> auf prod **gedroppt** (DB-verifiziert), die Dual-Status-Grundlage des Plans existiert nicht mehr.
> Fundament §9-#3 ist mit genau diesem Beleg abgehakt.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Isolation:** implement in a dedicated git worktree (`node scripts/new-session-worktree.mjs flag-fg1-claims-writer-funnel`).

**Goal:** Make it structurally impossible for `claims.status` (terminal/lifecycle axis) and `claims.operative_status` (operational open/closed cursor) to diverge, so a KB-set terminal no longer leaves a claim reading operationally-open for billing/open-filters.

**Architecture:** A **hybrid Option B** — a `BEFORE INSERT OR UPDATE OF status` DB trigger on `claims` (via MCP) that sets `operative_status` to the matching operational token whenever `status` moves to a terminal, plus a shared TS mapping helper (`claimTerminalToOperativeStatus`) that the two in-code terminal-writers (`setEndzustandFields`, `closeNurGutachterTerminAlsDurchgefuehrt`) call so the intent is visible + tested in code, plus a hardening `CHECK` on the (currently unconstrained) `operative_status` column. The state-machine (`transitionFallStatus`) already writes both axes and is left untouched; the trigger is idempotent and no-ops when `operative_status` already equals the target, so the engine path is not double-written.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- DDL ONLY via `mcp__plugin_supabase_supabase__apply_migration({name,query})`; then `list_migrations` to read the assigned version `<V>`; commit the file as `supabase/migrations/<V>_<name>.sql` (filename == tracked version); verify via `execute_sql` (READ-only). NEVER supabase-CLI (`db push`) and NEVER raw `execute_sql` for DDL. Project ref = `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY).
- Server-actions return `{ ok: boolean; error?: string }` (no throw) + `revalidatePath` on mutation. The 7 endzustand actions already follow this — do NOT change their signatures/return shape.
- Never export non-function constants from a `'use server'` file (Client-Bundle → `undefined`); the shared mapping helper + terminal-set live in a plain (non-`'use server'`) module, mirroring `close-nur-gutachter-termin.ts`.
- Every commit message ends with an `Audit:` block (7 points) + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- DB column/enum names are verified against live DB + code (2026-07-11); re-verify by reading before each task. UI-facing strings (none here — backend only) would need real Umlaute; this FG is backend-only so ASCII in comments/logs is fine.
- No UI change in this FG (no new entry point) — Audit point 2 is `n/a (kein UI-Change)`.

---

## Context: verified facts (Stand 2026-07-11 — RE-VERIFY before each task)

**The drift (self-verified, spec §3.1):** `src/lib/claims/endzustand-actions.ts` → `setEndzustandFields` (~lines 95-120) writes `claims.status` directly for all 7 `markClaimAs…` actions, sets `endzustand_*` audit fields, gates on `work_state` (line 143, only in `markClaimAsInKommunikationVs`), and **never touches `operative_status`**. An **8th terminal-writer** exists: `src/lib/termine/close-nur-gutachter-termin.ts` → `closeNurGutachterTerminAlsDurchgefuehrt` (~lines 74-83) writes `status='termin_durchgefuehrt'` + audit fields and also never sets `operative_status`.

**The reader impact (verified via Grep, ~10 sites):** open/closed filters key on the **operative_status** vocabulary, e.g.:
- `src/app/api/cron/case-billing-batch/route.ts:58` — `.in('operative_status', BILLABLE_STATUSES)`
- `src/app/admin/finance/(hub)/offene-faelle/page.tsx:50` — same
- `src/app/admin/finance/(hub)/page.tsx:490-491` — `.not('operative_status','in','("abgeschlossen","storniert")')` / `.eq('operative_status','abgeschlossen')`
- `src/lib/leads/convert-lead-to-claim.ts:803` — `.not('operative_status','in','("abgeschlossen","storniert","reguliert","abgelehnt")')`
- `src/lib/mietwagen/cron.ts:61` — `.not('claims.operative_status','eq','storniert')` (+ `abgeschlossen_am is null`)
- also: `src/app/admin/_components/KritischeUpdatesWidget.tsx:126`, `KpiCards.tsx:68`, `src/app/api/twilio/inbound-kb-whatsapp/route.ts:89`, `src/app/gutachter/posteingang/page.tsx:46`, `src/app/api/chat/inbox-threads/route.ts:53`, `src/app/api/chat/fall-lookup/route.ts:28`, `src/app/admin/sachverstaendige/_karte/actions.ts:81/104/154`, `src/app/faelle/[id]/page.tsx:528`.

**The vocabulary mismatch (decision-driver):**
- `claims.status` CHECK (verified live): `NULL | dispatch_done | in_bearbeitung | in_kommunikation_vs | reguliert | abgelehnt | an_externe_kanzlei_uebergeben | storniert | reguliert_vollstaendig | klage_rechtsstreit | verjaehrt | abgelehnt_final | termin_durchgefuehrt`.
- `claims.operative_status` — **NO CHECK constraint exists** (verified live: only `claims_status_check`, `claims_work_state_check`, `claims_reparatur_vermittlung_status_check`). Live distinct values today: `ersterfassung(25), sv-termin(13), kanzlei-uebergeben(6), abgeschlossen(4)`. Vocabulary = the 19-value fall-status axis (`FALL_STATUS_TRANSITIONS` keys in `state-machine.ts`), NOT the claims.status terminals.
- `claims.work_state` CHECK (verified live): `NULL | dispatch_done | in_bearbeitung` — a narrow dispatch/processing axis. **Out of scope for FG1** (deferred to FG6); we do NOT touch it.

**Why NOT Option A (route the 7 actions through `transitionFallStatus`):** the engine validates transitions against `FALL_STATUS_TRANSITIONS`; the only operative terminals it reaches are `abgeschlossen` (only from `regulierung`/`klage`/`zahlung-eingegangen`) and `storniert`. A KB regulating a claim that sits at `operative_status='kanzlei-uebergeben'` cannot legally jump to `abgeschlossen` (path requires `regulierung → zahlung-eingegangen → abgeschlossen`, or `klage → abgeschlossen`). The engine also does not set the `endzustand_*` audit fields and has no representation for the non-terminal endzustand states `in_kommunikation_vs` / `abgelehnt` (which must NOT close the claim). Forcing Option A would require broadening the transition matrix (dangerous, touches 470d55c9's engine) and re-plumbing audit semantics into the engine. **Rejected.**

**Chosen mapping** (claims.status terminal → operative_status operational token):
| claims.status (terminal) | operative_status target | rationale |
|---|---|---|
| `reguliert_vollstaendig` | `abgeschlossen` | happy-path close; readers treat `abgeschlossen` as closed |
| `storniert` | `storniert` | engine-native closed token |
| `an_externe_kanzlei_uebergeben` | `abgeschlossen` | out of Claimondo's hands = operationally closed |
| `klage_rechtsstreit` | `abgeschlossen` | engine maps `klage → abgeschlossen` (line 45) |
| `verjaehrt` | `abgeschlossen` | terminal dead-end = closed |
| `abgelehnt_final` | `abgeschlossen` | final rejection = closed |
| `termin_durchgefuehrt` | `abgeschlossen` | nur_gutachter/embed-B terminal (no regulierungs-tail) = closed |
| `in_kommunikation_vs` (NON-terminal) | *(no change)* | claim is operationally OPEN — must stay open |
| `abgelehnt` (NON-terminal, nachforderbar) | *(no change)* | still open/appealable |

Note: the operative tokens `reguliert` / `abgelehnt` appear in some *closed*-read filters but are never *written* to `operative_status` by any code (Grep-verified) — they are defensive/legacy. We deliberately map to `abgeschlossen` (the live, engine-produced closed token) for terminals, and to `storniert` for storno, matching what the readers already treat as closed.

**Canonical terminal list already exists:** `CLAIM_TERMINAL_STATUSES` in `src/lib/termine/close-nur-gutachter-termin.ts:22-26` = `['reguliert_vollstaendig','storniert','klage_rechtsstreit','verjaehrt','abgelehnt_final','an_externe_kanzlei_uebergeben','termin_durchgefuehrt']`. `endzustand-actions.ts` has a private `ENDZUSTAENDE` (same 7). We centralize a single source.

**No existing trigger syncs status→operative_status** (verified `pg_trigger` on `claims`: only claim_nummer / verjaehrung / bridge-sync / kb-rolle / updated_at / werkstatt-provision / reparatur — all orthogonal).

**Test harness pattern:** queue-based Supabase builder mock, see `src/lib/leads/__tests__/convert-lead-to-claim.test.ts:17-120` and `src/lib/faelle/fall-status-claim-mapping.test.ts` (pure-function style). Vitest config: `vitest.config.ts`. Run a single file with `npx vitest run <path>`.

**Coordination / file-overlap:** the claims state-machine is core plumbing owned historically by the **470d55c9 (ops-state/state-machine)** lane — currently no active session on it. This FG does **not** modify `state-machine.ts` or `FALL_STATUS_TRANSITIONS`; it only adds a trigger + a shared helper + calls in two terminal-writer modules. `close-nur-gutachter-termin.ts` is touched by the **6c630247 (Termin-Lifecycle)** and repair-loop lanes (they add terminal-close callers) — our change there is additive (one extra field in an existing update). Leave a coordination marker under `…/memory/` before starting. DEFER `work_state`/`operative_status` consolidation (FG6) — do not make it harder (we add no new coupling to `work_state`).

---

## File Structure

**Created:**
- `src/lib/claims/operative-status-mapping.ts` — plain module (NOT `'use server'`). Exports `CLAIM_TERMINAL_STATUSES` (single source of truth, the 7 terminals), `TERMINAL_TO_OPERATIVE` map, and `claimTerminalToOperativeStatus(status: string): string | null` (returns the operational token for a terminal, or `null` for non-terminal / unknown → "do not change operative_status").
- `src/lib/claims/operative-status-mapping.test.ts` — vitest for the pure helper.
- `src/lib/claims/endzustand-actions.test.ts` — vitest proving each endzustand action sets `operative_status` (via the mocked update payload) — the regression guard missing today.
- `supabase/migrations/<V>_fg1_claims_operative_status_terminal_sync.sql` — the trigger + function (committed after MCP assigns `<V>`).
- `supabase/migrations/<V2>_fg1_claims_operative_status_check.sql` — the hardening CHECK on `operative_status` (separate migration; applied after backfill so it can't fail on stale rows).

**Modified:**
- `src/lib/claims/endzustand-actions.ts` — `setEndzustandFields` writes `operative_status` when the target status is terminal (via helper); replace private `ENDZUSTAENDE` with imported `CLAIM_TERMINAL_STATUSES`.
- `src/lib/termine/close-nur-gutachter-termin.ts` — `closeNurGutachterTerminAlsDurchgefuehrt` adds `operative_status: 'abgeschlossen'` to its claim-close update; re-export or re-import `CLAIM_TERMINAL_STATUSES` from the new shared module (keep back-compat for its existing importers).

**Untouched (verified consumers):** `src/lib/faelle/state-machine.ts`, `src/lib/faelle/fall-status-claim-mapping.ts`, `src/components/shared/claims/EndzustandModal.tsx`, `src/lib/kanzlei/actions.ts` (calls `markClaimAsAnExterneKanzlei`). The trigger backstops all of them.

---

## Task 1 — Shared mapping helper (pure function + single terminal source)

**Files:**
- Create: `src/lib/claims/operative-status-mapping.ts`
- Test: `src/lib/claims/operative-status-mapping.test.ts`

**Interfaces:**
- Produces:
  - `export const CLAIM_TERMINAL_STATUSES: readonly string[]` — the 7 terminal `claims.status` values.
  - `export const TERMINAL_TO_OPERATIVE: Readonly<Record<string, string>>` — 7 entries mapping each terminal to its operative token.
  - `export function claimTerminalToOperativeStatus(status: string | null): string | null` — returns the operative token if `status` is terminal, else `null`.
- Consumes: nothing (pure).

**Steps:**
1. - [ ] Write failing test `src/lib/claims/operative-status-mapping.test.ts` (REAL code):
```ts
import { describe, it, expect } from 'vitest'
import {
  CLAIM_TERMINAL_STATUSES,
  TERMINAL_TO_OPERATIVE,
  claimTerminalToOperativeStatus,
} from './operative-status-mapping'

describe('claimTerminalToOperativeStatus', () => {
  it('maps each terminal claims.status to an operational token', () => {
    expect(claimTerminalToOperativeStatus('reguliert_vollstaendig')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('an_externe_kanzlei_uebergeben')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('klage_rechtsstreit')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('verjaehrt')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('abgelehnt_final')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('termin_durchgefuehrt')).toBe('abgeschlossen')
    expect(claimTerminalToOperativeStatus('storniert')).toBe('storniert')
  })

  it('returns null for non-terminal statuses (claim stays operationally open)', () => {
    expect(claimTerminalToOperativeStatus('in_kommunikation_vs')).toBeNull()
    expect(claimTerminalToOperativeStatus('abgelehnt')).toBeNull() // nachforderbar
    expect(claimTerminalToOperativeStatus('in_bearbeitung')).toBeNull()
    expect(claimTerminalToOperativeStatus('dispatch_done')).toBeNull()
    expect(claimTerminalToOperativeStatus(null)).toBeNull()
    expect(claimTerminalToOperativeStatus('voellig-unbekannt')).toBeNull()
  })

  it('CLAIM_TERMINAL_STATUSES has exactly the 7 terminals and matches the map keys', () => {
    expect([...CLAIM_TERMINAL_STATUSES].sort()).toEqual(
      [
        'abgelehnt_final',
        'an_externe_kanzlei_uebergeben',
        'klage_rechtsstreit',
        'reguliert_vollstaendig',
        'storniert',
        'termin_durchgefuehrt',
        'verjaehrt',
      ].sort(),
    )
    expect(Object.keys(TERMINAL_TO_OPERATIVE).sort()).toEqual([...CLAIM_TERMINAL_STATUSES].sort())
  })

  it('every terminal maps to a live operational closed token (abgeschlossen | storniert)', () => {
    for (const t of CLAIM_TERMINAL_STATUSES) {
      expect(['abgeschlossen', 'storniert']).toContain(TERMINAL_TO_OPERATIVE[t])
    }
  })
})
```
2. - [ ] Run to see it fail: `npx vitest run src/lib/claims/operative-status-mapping.test.ts` → expect **fail** (module `./operative-status-mapping` does not exist / import error).
3. - [ ] Minimal impl `src/lib/claims/operative-status-mapping.ts` (REAL code):
```ts
// FG1 (interaction-flags §3.1): single-writer funnel for claims.status ⟷ operative_status.
//
// claims.status = lifecycle/terminal axis. claims.operative_status = operational
// open/closed cursor that billing + open-filters key on (~10 readers, see the FG1
// plan). When a terminal status is set outside the state-machine (endzustand-actions,
// nur_gutachter-close), operative_status must move to the matching CLOSED token so the
// claim does not read operationally-open. This module is the code-side of that mapping;
// a DB trigger (same migration lane) is the backstop for every other writer.
//
// NOT a 'use server' file on purpose: these non-function exports must be importable by
// client + server without becoming undefined in the client bundle (AGENTS.md §use-server).

/** Terminal claims.status values — from these, no further lifecycle transition is allowed.
 *  Single source of truth (previously duplicated as ENDZUSTAENDE in endzustand-actions.ts
 *  and CLAIM_TERMINAL_STATUSES in termine/close-nur-gutachter-termin.ts). */
export const CLAIM_TERMINAL_STATUSES = [
  'reguliert_vollstaendig',
  'storniert',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
] as const

/** claims.status terminal -> claims.operative_status operational token.
 *  Only 'abgeschlossen' and 'storniert' are produced (the two live closed tokens the
 *  ~10 open/closed readers treat as closed; verified 2026-07-11). Non-terminal endzustand
 *  states (in_kommunikation_vs, plain abgelehnt) are intentionally absent -> claim stays open. */
export const TERMINAL_TO_OPERATIVE: Readonly<Record<string, string>> = {
  reguliert_vollstaendig: 'abgeschlossen',
  an_externe_kanzlei_uebergeben: 'abgeschlossen',
  klage_rechtsstreit: 'abgeschlossen',
  verjaehrt: 'abgeschlossen',
  abgelehnt_final: 'abgeschlossen',
  termin_durchgefuehrt: 'abgeschlossen',
  storniert: 'storniert',
}

/** Returns the operational token to write to operative_status for a terminal status,
 *  or null when `status` is non-terminal / unknown (= do not change operative_status). */
export function claimTerminalToOperativeStatus(status: string | null): string | null {
  if (!status) return null
  return TERMINAL_TO_OPERATIVE[status] ?? null
}
```
4. - [ ] Run to pass: `npx vitest run src/lib/claims/operative-status-mapping.test.ts` → expect **4 passed**.
5. - [ ] Commit:
```
git add src/lib/claims/operative-status-mapping.ts src/lib/claims/operative-status-mapping.test.ts
git commit -m "$(cat <<'EOF'
feat(FG1): shared claims terminal->operative_status mapping helper

Single source of truth for the 7 terminal claims.status values + their
operational operative_status token (abgeschlossen/storniert). Code side of the
FG1 single-writer funnel; DB trigger backstop follows.

Audit:
- Build: gruen (npx vitest run mapping.test.ts, 4 passed) — tsc in Task 5
- UI: n/a (kein UI-Change)
- Redundanz: zentralisiert ENDZUSTAENDE (endzustand-actions) + CLAIM_TERMINAL_STATUSES (close-nur-gutachter) in EIN Modul; Rewire in Task 2/3
- Dead-Code: keiner (neues Modul)
- Spec: FG1 mapping-Tabelle 1:1 (7 terminals -> abgeschlossen/storniert; in_kommunikation_vs/abgelehnt bleiben offen)
- Inkonsistenz: operative-Token gegen live-DB verifiziert (nur abgeschlossen/storniert werden geschrieben)
- Regression: reine additive Datei, kein Consumer geaendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Funnel the 7 endzustand actions (in-code operative_status write)

**Files:**
- Modify: `src/lib/claims/endzustand-actions.ts`
- Test: `src/lib/claims/endzustand-actions.test.ts` (Create)

**Interfaces:**
- Consumes: `claimTerminalToOperativeStatus`, `CLAIM_TERMINAL_STATUSES` from `@/lib/claims/operative-status-mapping`.
- Produces: unchanged public signatures — `markClaimAsReguliert`, `markClaimAsStorniert`, `markClaimAsAbgelehnt`, `markClaimAsKlage`, `markClaimAsVerjaehrt`, `markClaimAsAnExterneKanzlei`, `markClaimAsInKommunikationVs` still return `Promise<ActionResult>` (`{ ok: true } | { ok: false; error }`). Internal: `setEndzustandFields` derives + injects `operative_status` into the update payload when the target `status` is terminal.

**Precise change to `setEndzustandFields` (verify lines ~95-120 first):** it currently receives `fields` (which contains `status`). After building the update object, if `fields.status` is a string and `claimTerminalToOperativeStatus(fields.status)` returns non-null, add `operative_status: <that token>` to the `.update({...})` payload. Non-terminal calls (`in_kommunikation_vs`, plain `abgelehnt`) pass through unchanged (helper returns null → no operative_status write). Replace the private `ENDZUSTAENDE` const (lines ~26-33) with `import { CLAIM_TERMINAL_STATUSES as ENDZUSTAENDE } from '@/lib/claims/operative-status-mapping'` (or import under its own name and pass it as the `guardStatus` arg — keep the guard semantics identical). Keep the `.not('status','in', ...)` atomic guard exactly as-is.

**Steps:**
1. - [ ] RE-READ `src/lib/claims/endzustand-actions.ts` (lines 26-33 `ENDZUSTAENDE`, 95-120 `setEndzustandFields`, and the 7 call-sites) to confirm current shape.
2. - [ ] Write failing test `src/lib/claims/endzustand-actions.test.ts` (REAL code — queue-based mock mirroring `convert-lead-to-claim.test.ts`; the harness must capture the `.update()` payload and let the chain resolve `.select().maybeSingle()`):
```ts
// FG1 regression guard: every terminal endzustand action MUST co-write operative_status
// (the divergence bug from interaction-flags §3.1). Non-terminal actions must NOT.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- capture the last claims UPDATE payload ---
let lastClaimsUpdate: Record<string, unknown> | null = null

function makeClaimsBuilder() {
  const chain: Record<string, unknown> = {}
  const ret = () => chain
  chain.update = (payload: Record<string, unknown>) => { lastClaimsUpdate = payload; return chain }
  chain.eq = ret
  chain.not = ret
  chain.select = ret
  // terminal call: the guarded update returns a row (success)
  chain.maybeSingle = () => Promise.resolve({ data: { id: 'claim-1' }, error: null })
  return chain
}

// loadClaimContext reads claims (id,status,work_state,kundenbetreuer_id) then faelle_claim_bridge.
function makeContextClaimsBuilder() {
  const chain: Record<string, unknown> = {}
  const ret = () => chain
  chain.select = ret
  chain.eq = ret
  chain.maybeSingle = () =>
    Promise.resolve({
      data: { id: 'claim-1', status: 'in_kommunikation_vs', work_state: 'in_bearbeitung', kundenbetreuer_id: 'kb-1' },
      error: null,
    })
  return chain
}
function makeBridgeBuilder() {
  const chain: Record<string, unknown> = {}
  const ret = () => chain
  chain.select = ret
  chain.eq = ret
  chain.maybeSingle = () => Promise.resolve({ data: { fall_id: 'fall-1' }, error: null })
  return chain
}
function makeAuditBuilder() {
  const chain: Record<string, unknown> = {}
  chain.insert = () => Promise.resolve({ data: null, error: null })
  return chain
}

// call order per action: from('claims')[context] -> from('faelle_claim_bridge') ->
//                        from('claims')[update] -> from('phase_transitions')[audit]
let fromCallIndex = 0
const adminMock = {
  from: (table: string) => {
    if (table === 'faelle_claim_bridge') return makeBridgeBuilder()
    if (table === 'phase_transitions') return makeAuditBuilder()
    // claims: 1st call in an action = context read, 2nd = the guarded update
    fromCallIndex += 1
    return fromCallIndex % 2 === 1 ? makeContextClaimsBuilder() : makeClaimsBuilder()
  },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMock }))
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => ({ success: true, user: { id: 'kb-1', rolle: 'kundenbetreuer' } }),
}))
vi.mock('@/lib/notifications/emit', () => ({ emitEvent: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  markClaimAsReguliert,
  markClaimAsStorniert,
  markClaimAsKlage,
  markClaimAsVerjaehrt,
  markClaimAsAnExterneKanzlei,
  markClaimAsAbgelehnt,
  markClaimAsInKommunikationVs,
} from './endzustand-actions'

beforeEach(() => { lastClaimsUpdate = null; fromCallIndex = 0 })

describe('endzustand actions co-write operative_status (FG1 regression guard)', () => {
  it('markClaimAsReguliert -> status reguliert_vollstaendig + operative_status abgeschlossen', async () => {
    const r = await markClaimAsReguliert({ claim_id: 'claim-1', regulierungs_betrag: 100 })
    expect(r).toEqual({ ok: true })
    expect(lastClaimsUpdate?.status).toBe('reguliert_vollstaendig')
    expect(lastClaimsUpdate?.operative_status).toBe('abgeschlossen')
  })

  it('markClaimAsStorniert -> operative_status storniert', async () => {
    await markClaimAsStorniert({ claim_id: 'claim-1', grund: 'test grund' })
    expect(lastClaimsUpdate?.status).toBe('storniert')
    expect(lastClaimsUpdate?.operative_status).toBe('storniert')
  })

  it('markClaimAsKlage -> operative_status abgeschlossen', async () => {
    await markClaimAsKlage({ claim_id: 'claim-1', grund: 'test grund' })
    expect(lastClaimsUpdate?.operative_status).toBe('abgeschlossen')
  })

  it('markClaimAsVerjaehrt -> operative_status abgeschlossen', async () => {
    await markClaimAsVerjaehrt({ claim_id: 'claim-1', grund: 'test grund' })
    expect(lastClaimsUpdate?.operative_status).toBe('abgeschlossen')
  })

  it('markClaimAsAnExterneKanzlei -> operative_status abgeschlossen', async () => {
    await markClaimAsAnExterneKanzlei({ claim_id: 'claim-1', kanzlei_name: 'X', uebergabe_datum: '2026-07-11' })
    expect(lastClaimsUpdate?.operative_status).toBe('abgeschlossen')
  })

  it('markClaimAsAbgelehnt final=true -> abgelehnt_final + operative_status abgeschlossen', async () => {
    await markClaimAsAbgelehnt({ claim_id: 'claim-1', vs_ablehnungs_grund: 'haftung', final: true })
    expect(lastClaimsUpdate?.status).toBe('abgelehnt_final')
    expect(lastClaimsUpdate?.operative_status).toBe('abgeschlossen')
  })

  it('markClaimAsAbgelehnt (non-final) -> status abgelehnt, NO operative_status write (stays open)', async () => {
    await markClaimAsAbgelehnt({ claim_id: 'claim-1', vs_ablehnungs_grund: 'haftung' })
    expect(lastClaimsUpdate?.status).toBe('abgelehnt')
    expect('operative_status' in (lastClaimsUpdate ?? {})).toBe(false)
  })

  it('markClaimAsInKommunikationVs (non-terminal) -> NO operative_status write', async () => {
    await markClaimAsInKommunikationVs({ claim_id: 'claim-1', grund: 'verhandeln' })
    expect(lastClaimsUpdate?.status).toBe('in_kommunikation_vs')
    expect('operative_status' in (lastClaimsUpdate ?? {})).toBe(false)
  })
})
```
   > Note for implementer: verify the exact `from()` call order per action by reading the action bodies (context read → bridge → guarded update → audit insert; some actions also call `emitEvent`, already mocked). Adjust the `fromCallIndex % 2` toggle if an action issues an extra intermediate `claims` read. If the ordering proves brittle, simplify the harness to key builders by a per-test call counter — but keep the assertions (payload `status` + `operative_status`) unchanged.
3. - [ ] Run to see it fail: `npx vitest run src/lib/claims/endzustand-actions.test.ts` → expect **fail** (`operative_status` is `undefined` in the captured payload — the bug).
4. - [ ] Minimal impl in `src/lib/claims/endzustand-actions.ts`:
   - Add import: `import { CLAIM_TERMINAL_STATUSES, claimTerminalToOperativeStatus } from '@/lib/claims/operative-status-mapping'`.
   - Delete the private `const ENDZUSTAENDE = [...] as const` (lines ~26-33) and replace its usages (the 7 `setEndzustandFields(..., ENDZUSTAENDE)` guard args) with `CLAIM_TERMINAL_STATUSES` (identical values → guard semantics preserved). Keep the explanatory comment about which states are terminal.
   - In `setEndzustandFields`, inside the `.update({...})`, after spreading `...fields` and the `endzustand_*` fields, conditionally add operative_status:
```ts
const targetStatus = typeof fields.status === 'string' ? fields.status : null
const operativeToken = claimTerminalToOperativeStatus(targetStatus)
const { data, error } = await admin
  .from('claims')
  .update({
    ...fields,
    ...(operativeToken ? { operative_status: operativeToken } : {}),
    endzustand_gesetzt_durch_user_id: user.id,
    endzustand_gesetzt_am:            new Date().toISOString(),
    endzustand_grund:                 grund,
  })
  .eq('id', claimId)
  .not('status', 'in', `(${guardStatus.map((s) => `"${s}"`).join(',')})`)
  .select('id')
  .maybeSingle()
```
   (`operative_status` is not in the generated claims types yet — use the object-literal form above; if tsc complains, cast the update arg with `as never`/`Record<string, unknown>` exactly like the existing `create-for-fall.ts:137` / `convert-lead-to-claim.ts:414` pattern.)
5. - [ ] Run to pass: `npx vitest run src/lib/claims/endzustand-actions.test.ts` → expect **8 passed**.
6. - [ ] Commit:
```
git add src/lib/claims/endzustand-actions.ts src/lib/claims/endzustand-actions.test.ts
git commit -m "$(cat <<'EOF'
fix(FG1): endzustand actions co-write operative_status on terminal

setEndzustandFields now sets operative_status to the matching closed token
(abgeschlossen/storniert) whenever the target claims.status is terminal, closing
the status<->operative_status divergence (interaction-flags §3.1). Non-terminal
in_kommunikation_vs/abgelehnt stay operationally open. ENDZUSTAENDE replaced by
the shared CLAIM_TERMINAL_STATUSES.

Audit:
- Build: gruen (npx vitest run endzustand-actions.test.ts, 8 passed); tsc in Task 5
- UI: n/a (kein UI-Change; EndzustandModal-Signaturen unveraendert)
- Redundanz: privates ENDZUSTAENDE entfernt -> shared CLAIM_TERMINAL_STATUSES
- Dead-Code: alte ENDZUSTAENDE-Konstante geloescht
- Spec: alle 7 markClaimAs* co-writen operative_status; non-terminale bleiben offen
- Inkonsistenz: Result-Shape {ok} unveraendert; guard .not(status in ...) intakt
- Regression: 7 Actions + Caller (EndzustandModal, kanzlei/actions markClaimAsAnExterneKanzlei) Signatur-stabil

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Funnel the nur_gutachter terminal-close (8th writer) + de-duplicate terminal list

**Files:**
- Modify: `src/lib/termine/close-nur-gutachter-termin.ts`
- Test: extend `src/lib/claims/operative-status-mapping.test.ts` (import round-trip) OR add a focused unit test capturing the claim-close update payload.

**Interfaces:**
- Consumes: `CLAIM_TERMINAL_STATUSES` from `@/lib/claims/operative-status-mapping` (replace the locally-defined copy; keep the SAME export name so existing importers of `close-nur-gutachter-termin`'s `CLAIM_TERMINAL_STATUSES` keep working — re-export it).
- Produces: `closeNurGutachterTerminAlsDurchgefuehrt(...)` unchanged signature/return `{ ok, error? }`; its claim `.update({...})` now also sets `operative_status: 'abgeschlossen'`.

**Steps:**
1. - [ ] RE-READ `src/lib/termine/close-nur-gutachter-termin.ts` (esp. the local `CLAIM_TERMINAL_STATUSES` at lines 22-26 and the claim-close update at lines 74-83) AND find its importers: `Grep` for `CLAIM_TERMINAL_STATUSES` across `src/` to confirm who imports it from this module before changing the source.
2. - [ ] Write a failing focused test (append to `operative-status-mapping.test.ts` or a small new `close-nur-gutachter-termin.test.ts`) that mocks the admin client and asserts the claim-close update payload contains `operative_status: 'abgeschlossen'` alongside `status: 'termin_durchgefuehrt'`. (Same capture technique as Task 2: a builder whose `.update(payload)` records `payload`; `gutachter_termine` update resolves `{error:null}`; the tracking-webhook dynamic import is already isolated — mock `@/lib/embed/tracking-webhook`'s `fireTrackingWebhook` to a no-op.)
3. - [ ] Run to see it fail: `npx vitest run <that test>` → expect **fail** (`operative_status` missing).
4. - [ ] Minimal impl:
   - Replace the local `export const CLAIM_TERMINAL_STATUSES = [...] as const` with a re-export: `export { CLAIM_TERMINAL_STATUSES } from '@/lib/claims/operative-status-mapping'` (preserves the module's public API for its importers).
   - In the claim-close `.update({...})` (lines ~76-81) add `operative_status: 'abgeschlossen',` (the `termin_durchgefuehrt` terminal → operative `abgeschlossen`, per the mapping table). Optionally derive it via `claimTerminalToOperativeStatus('termin_durchgefuehrt')` for symmetry, but the literal is acceptable here since this path is hard-coded to that one terminal. Keep the `.not('status','in', CLAIM_TERMINAL_STATUSES...)` guard and the non-fatal error handling exactly as-is.
5. - [ ] Run to pass: `npx vitest run <that test>` → expect pass.
6. - [ ] Commit:
```
git add src/lib/termine/close-nur-gutachter-termin.ts src/lib/claims/operative-status-mapping.test.ts
git commit -m "$(cat <<'EOF'
fix(FG1): nur_gutachter terminal-close co-writes operative_status

closeNurGutachterTerminAlsDurchgefuehrt (8th direct claims.status terminal-writer)
now sets operative_status='abgeschlossen' with status='termin_durchgefuehrt', so
embed-B/nur_gutachter claims read operationally-closed. Local CLAIM_TERMINAL_STATUSES
re-exported from the shared mapping module (single source).

Audit:
- Build: gruen (npx vitest run, pass); tsc in Task 5
- UI: n/a (kein UI-Change)
- Redundanz: dritte Kopie der Terminal-Liste entfernt -> re-export shared
- Dead-Code: lokale CLAIM_TERMINAL_STATUSES-Definition ersetzt durch re-export (Importer stabil)
- Spec: schliesst den 8. Writer den §3.1 nicht auflistete; operative_status kann nicht mehr stale bleiben
- Inkonsistenz: nur_gutachter terminal -> abgeschlossen (mapping-Tabelle)
- Regression: Importer von CLAIM_TERMINAL_STATUSES (via Grep verifiziert) via re-export unveraendert; Caller-Signatur stabil

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — DB trigger backstop (operative_status auto-sync on terminal status) via MCP

**Files:**
- Create (after MCP assigns version): `supabase/migrations/<V>_fg1_claims_operative_status_terminal_sync.sql`

**Interfaces:**
- Produces: Postgres function `fg1_sync_operative_status_on_terminal()` + trigger `trg_fg1_operative_status_on_terminal` `BEFORE INSERT OR UPDATE OF status ON public.claims`. When `NEW.status` is one of the 7 terminals, it sets `NEW.operative_status` to the matching token (`abgeschlossen`/`storniert`) **only if it differs** (idempotent; no-op when the engine already set it → no double-write, no recursive concern since it's BEFORE + mutates NEW).
- Consumes: nothing external.

**Rationale for a trigger backstop (Option B core):** guarantees DB-level consistency for **every** writer of `claims.status` — the 7 endzustand actions, the nur_gutachter close, `manualStatusOverride`/LexDrive paths, `transitionFallStatus`, and any future writer — so the invariant holds even if code forgets. `BEFORE` + mutating `NEW` avoids a second UPDATE and recursion. It complements (not replaces) the in-code writes from Tasks 2-3, which keep the intent visible + unit-tested.

**Steps:**
1. - [ ] RE-VERIFY live before writing DDL:
   - `execute_sql` (READ): re-confirm `claims_status_check` still lists the same 12 status values and that **no** CHECK on `operative_status` exists.
   - `execute_sql` (READ): re-confirm no trigger named like `%operative_status%` already exists on `claims`.
2. - [ ] Author the DDL (function is idempotent, `SET search_path = public, pg_temp`, `SECURITY INVOKER` default is fine — no elevated needs):
```sql
-- FG1: keep claims.operative_status in lock-step with terminal claims.status.
-- Backstop for every writer of claims.status (endzustand-actions, nur_gutachter-close,
-- manual override, state-machine, future). BEFORE + mutate NEW => idempotent, no 2nd write.
create or replace function public.fg1_sync_operative_status_on_terminal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target text;
begin
  target := case new.status
    when 'reguliert_vollstaendig'        then 'abgeschlossen'
    when 'an_externe_kanzlei_uebergeben' then 'abgeschlossen'
    when 'klage_rechtsstreit'            then 'abgeschlossen'
    when 'verjaehrt'                     then 'abgeschlossen'
    when 'abgelehnt_final'               then 'abgeschlossen'
    when 'termin_durchgefuehrt'          then 'abgeschlossen'
    when 'storniert'                     then 'storniert'
    else null
  end;
  -- Only for terminal statuses, and only if it actually diverges (idempotent no-op
  -- when the state-machine already set operative_status to the same value).
  if target is not null and new.operative_status is distinct from target then
    new.operative_status := target;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fg1_operative_status_on_terminal on public.claims;
create trigger trg_fg1_operative_status_on_terminal
  before insert or update of status on public.claims
  for each row
  execute function public.fg1_sync_operative_status_on_terminal();
```
3. - [ ] Apply via MCP: `mcp__plugin_supabase_supabase__apply_migration({ name: 'fg1_claims_operative_status_terminal_sync', query: <DDL above> })`.
4. - [ ] `mcp__plugin_supabase_supabase__list_migrations` → read the assigned version `<V>` (the plugin sets its OWN timestamp — do not guess).
5. - [ ] Create the committed file `supabase/migrations/<V>_fg1_claims_operative_status_terminal_sync.sql` with the exact DDL applied (filename == `<V>`).
6. - [ ] Verify via `execute_sql` (READ):
   - `SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_fg1_operative_status_on_terminal';` → present.
   - Behavior probe on a scratch/throwaway or existing NON-terminal claim WITHOUT mutating real terminal data — prefer a read-only assertion: pick an existing open claim id, then run an **`UPDATE ... RETURNING`** inside a transaction you roll back is NOT available via MCP; instead assert the mapping logically is covered by the vitest + do a single safe forward test: choose one already-terminal-eligible claim in a dev context, or skip live-mutation and rely on the unit tests + the reader-consistency check in Task 6. (Do NOT flip a real production claim to a terminal just to test.)
7. - [ ] Backfill existing divergent rows (one-time, READ first then a scoped UPDATE via MCP `execute_sql` is a DML write, which is allowed — only DDL is plugin-only): 
   - READ: `SELECT id, status, operative_status FROM claims WHERE status IN ('reguliert_vollstaendig','an_externe_kanzlei_uebergeben','klage_rechtsstreit','verjaehrt','abgelehnt_final','termin_durchgefuehrt') AND operative_status IS DISTINCT FROM 'abgeschlossen';` and the storniert variant.
   - If any rows: run the corresponding `UPDATE claims SET operative_status = 'abgeschlossen' WHERE ...` / `= 'storniert' WHERE status='storniert' AND ...`. (Note: today's live data shows only `ersterfassung/sv-termin/kanzlei-uebergeben/abgeschlossen` operative values and no terminal claims.status rows yet — backfill will likely be a no-op, but run the check.) Document the row count in the commit body.
8. - [ ] Commit:
```
git add supabase/migrations/<V>_fg1_claims_operative_status_terminal_sync.sql
git commit -m "$(cat <<'EOF'
feat(FG1): DB trigger syncs claims.operative_status on terminal status

BEFORE INSERT OR UPDATE OF status trigger sets operative_status to the matching
closed token (abgeschlossen/storniert) for the 7 terminals; idempotent no-op when
already equal (state-machine path). Backstops every claims.status writer so
operative_status can never go stale. Backfill: <N> divergent rows corrected.

Applied via MCP apply_migration; version <V> assigned by plugin; file named to match.

Audit:
- Build: n/a (DDL); trigger verified via pg_get_triggerdef (READ)
- UI: n/a
- Redundanz: keine (kein bestehender status->operative_status-Trigger; pg_trigger verifiziert)
- Dead-Code: n/a
- Spec: FG1 Ziel — status/operative_status koennen nicht divergieren (DB-Ebene)
- Inkonsistenz: Mapping identisch zum TS-Helper (Task 1); search_path gepinnt
- Regression: BEFORE+mutate NEW => keine 2. Query, keine Rekursion; state-machine no-op durch is-distinct-Guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Hardening CHECK on operative_status + full build

**Files:**
- Create (after MCP assigns version): `supabase/migrations/<V2>_fg1_claims_operative_status_check.sql`

**Interfaces:**
- Produces: a `CHECK` constraint restricting `claims.operative_status` to the known 19-value fall-status axis ∪ the closed tokens (`ersterfassung, onboarding, sv-gesucht, sv-zugewiesen, sv-termin, besichtigung, begutachtung-laeuft, gutachten-eingegangen, filmcheck, qc-pruefung, kanzlei-uebergeben, anschlussschreiben, regulierung, regulierung-laeuft, vs-kuerzt, nachbesichtigung-laeuft, vs-abgelehnt, klage, zahlung-eingegangen, abgeschlossen, storniert`) — i.e. exactly the keys of `FALL_STATUS_TRANSITIONS` in `state-machine.ts`. `NULL` allowed (matches status/work_state CHECK style).

**Rationale:** operative_status is currently free-text (verified). A CHECK is the §8 "status-literal not in CHECK" ratchet at the DB level — it would have caught the `geplant`/`kunde_storniert` class of silent-fail bugs on this column. Kept as a SEPARATE migration applied AFTER the trigger+backfill so it cannot fail on a stale row.

**Steps:**
1. - [ ] RE-VERIFY the exact allowed set: read `FALL_STATUS_TRANSITIONS` keys in `src/lib/faelle/state-machine.ts` (lines 20-49) AND run `execute_sql` READ `SELECT DISTINCT operative_status FROM claims;` — the CHECK's allowed list must be a superset of every live value (else the constraint add fails). Reconcile before writing DDL.
2. - [ ] Author DDL (add as NOT VALID first for safety, then VALIDATE — so it won't error mid-transaction if a legacy row slips through; if VALIDATE fails, the offending rows surface for a follow-up backfill):
```sql
alter table public.claims
  add constraint claims_operative_status_check
  check (
    operative_status is null or operative_status = any (array[
      'ersterfassung','onboarding','sv-gesucht','sv-zugewiesen','sv-termin',
      'besichtigung','begutachtung-laeuft','gutachten-eingegangen','filmcheck',
      'qc-pruefung','kanzlei-uebergeben','anschlussschreiben','regulierung',
      'regulierung-laeuft','vs-kuerzt','nachbesichtigung-laeuft','vs-abgelehnt',
      'klage','zahlung-eingegangen','abgeschlossen','storniert'
    ])
  ) not valid;

alter table public.claims validate constraint claims_operative_status_check;
```
3. - [ ] Apply via MCP `apply_migration({ name: 'fg1_claims_operative_status_check', query: <DDL> })` → `list_migrations` → read `<V2>` → commit `supabase/migrations/<V2>_fg1_claims_operative_status_check.sql`.
4. - [ ] Verify via `execute_sql` (READ): `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='claims_operative_status_check';` → present & valid.
5. - [ ] Regenerate types IF a consumer now references `operative_status` in a typed way (optional per AGENTS.md — types may lag until a consumer needs them; our writes use the `Record<string,unknown>` cast, so regen can be deferred). If regenerating: `mcp__plugin_supabase_supabase__generate_typescript_types` → update `src/lib/supabase/database.types.ts`.
6. - [ ] **Full build gate** (mandatory — Server-Actions + route consumers changed): `npx tsc --noEmit` then `npm run build`. Both must be green. Also run the FG1 vitest files: `npx vitest run src/lib/claims/operative-status-mapping.test.ts src/lib/claims/endzustand-actions.test.ts` (+ the nur_gutachter test). Re-run the neighbouring suite `npx vitest run src/lib/faelle/fall-status-claim-mapping.test.ts` to confirm no regression.
7. - [ ] Commit:
```
git add supabase/migrations/<V2>_fg1_claims_operative_status_check.sql src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
feat(FG1): CHECK constraint on claims.operative_status (19-axis + closed tokens)

operative_status was free-text (no CHECK). Add a CHECK to the FALL_STATUS_TRANSITIONS
axis plus abgeschlossen/storniert — the DB-level ratchet against invalid status
literals (the §8 concern that would have caught geplant/kunde_storniert on other
columns). Applied NOT VALID then VALIDATE after the terminal-sync backfill.

Audit:
- Build: gruen (tsc --noEmit + npm run build); FG1 + fall-status-claim-mapping vitest gruen
- UI: n/a
- Redundanz: keine
- Dead-Code: n/a
- Spec: haerte die operative_status-Achse; keine neue Drift moeglich
- Inkonsistenz: allowed-Set == FALL_STATUS_TRANSITIONS keys (state-machine) verifiziert; NULL erlaubt (wie status/work_state)
- Regression: alle Live-Werte im allowed-Set (execute_sql READ verifiziert vor VALIDATE)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Reader-consistency verification + coordination marker

**Files:** none created (verification + a `…/memory/` marker note).

**Steps:**
1. - [ ] Re-run the full FG1 test set + neighbours (as Task 5.6). All green.
2. - [ ] `execute_sql` (READ) sanity: `SELECT status, operative_status, count(*) FROM claims GROUP BY 1,2 ORDER BY 3 DESC;` → confirm NO row has a terminal `status` with an operative_status outside `{abgeschlossen, storniert}` (invariant now enforced by trigger).
3. - [ ] Grep-audit the ~10 open/closed readers (list in the Context section) — confirm none needs a code change (they already key on `operative_status` closed tokens, which now reflect terminals). Document that no reader edit is required (the fix is at the writer + DB level, by design). If any reader keys on `claims.status` terminals for open/closed AND is inconsistent with the operative tokens, note it as a FG5/FG6 follow-up — do NOT expand scope here.
4. - [ ] Write coordination marker under the memory dir noting: FG1 shipped (trigger + funnel + CHECK); state-machine.ts untouched; `close-nur-gutachter-termin.ts` touched additively (flag for 6c630247 / repair-loop lanes); work_state deferred to FG6.
5. - [ ] Session-close checklist (AGENTS.md Regel 3): `git status` clean, `git stash list` empty, `git log --branches --not --remotes` — all local commits pushed to the feature branch; open PR against `staging` (never `main`).

---

## Self-Review

**Spec coverage (FG1 goal = status/operative_status cannot diverge):**
- ✅ 7 endzustand actions co-write operative_status (Task 2) — the missing guard is now a regression test.
- ✅ 8th writer (`closeNurGutachterTerminAlsDurchgefuehrt`) funneled (Task 3) — a writer the spec §3.1 did not enumerate; caught by reading the code.
- ✅ DB trigger backstop (Task 4) guarantees the invariant for the 3 named bypasses (`sv-zuweisung/route.ts`, `create-for-fall.ts`, `convert-lead-to-claim.ts` — though those set operative_status at *creation* to non-terminal values, so they are unaffected; the trigger covers any future terminal write from them) + `manualStatusOverride` + LexDrive + `transitionFallStatus` (idempotent no-op).
- ✅ Regression test proving operative_status reflects the terminal after EACH endzustand action (Task 2, 8 cases incl. the two non-terminal negatives).
- ✅ work_state/operative_status consolidation explicitly DEFERRED to FG6; no new work_state coupling added.
- ✅ Decision documented: hybrid Option B (trigger backstop + in-code funnel + CHECK), with the Option-A-rejection reasoning (engine transition-validation + audit-field + non-terminal-state gaps).

**Placeholder scan:** No `TODO`/`<...>` left in code snippets except the DB-assigned `<V>`/`<V2>` migration versions and the backfill `<N>` row-count — both are values that MUST be filled from live MCP output at execution time (by design, per project DDL rule). No stubbed functions; all impl code is complete and runnable.

**Type consistency:** Public server-action signatures (`Promise<ActionResult>` = `{ ok: true } | { ok: false; error }`) unchanged. `operative_status` writes use the same `Record<string,unknown>` / object-literal cast pattern already established in `create-for-fall.ts:137` and `convert-lead-to-claim.ts:414` (types lag the DB per AGENTS.md; regen optional in Task 5). CHECK allowed-set == `FALL_STATUS_TRANSITIONS` keys, verified against live distinct values before VALIDATE. Trigger mapping == TS `TERMINAL_TO_OPERATIVE` (kept literally in sync; both list the same 7 terminals → 2 tokens).

**Risks / open questions for the implementer:**
1. **Non-terminal `abgelehnt` semantics** — the mapping deliberately leaves plain `abgelehnt` (nachforderbar) operationally OPEN. Confirm with the ops-state owner (470d55c9) that a `vs-abgelehnt`/`abgelehnt` claim should indeed keep counting as an open workload (the current readers exclude only `abgeschlossen/storniert/reguliert`, so `abgelehnt` already reads open — consistent). No change, but worth a sentence in the PR.
2. **`termin_durchgefuehrt` → `abgeschlossen`** assumes the nur_gutachter/embed-B claim has no further operational tail. Verified against `close-nur-gutachter-termin.ts` (it's the terminal close). If a future flow reopens such claims, the trigger's `is distinct from` guard still lets an explicit re-open write a non-closed operative_status (trigger only acts when status is one of the 7 terminals).
3. **CHECK add on a live column** — Task 5 uses `NOT VALID` then `VALIDATE`; if VALIDATE surfaces an unexpected legacy operative_status value (outside the 19-axis), it fails loudly → add that value to the allowed set or backfill it, do NOT drop the CHECK. Re-run the DISTINCT probe first (Task 5.1) to pre-empt.

**File-overlap with other lanes:**
- `src/lib/termine/close-nur-gutachter-termin.ts` — additively touched (one field + a re-export); flagged for **6c630247 (Termin-Lifecycle)** and the repair-loop lanes which add terminal-close callers. No signature change; their callers keep working.
- `src/lib/faelle/state-machine.ts` — **NOT modified** (470d55c9's core); the trigger is a pure additive backstop that no-ops on the engine path.
- The ~10 open/closed reader files — **NOT modified** (they already key on operative_status closed tokens).
