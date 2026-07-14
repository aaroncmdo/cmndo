# Offline-First Slice 1b (completeAndAdvance CAS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the SV complete a field stop + advance to the next one OFFLINE, syncing on reconnect — WITHOUT the double-advance bug that a naive replay of the session state-machine would cause.

**Architecture:** `completeAndAdvance` gets an optional `expectedAktuellerTerminId` compare-and-set (CAS) guard: the durable per-termin completion always applies (IF-NULL idempotent), but the session ADVANCE only runs if the server session is still on the termin we're completing. A pure `shouldSkipAdvance` helper encodes the invariant (node-testable). A new Class-C offline handler replays `completeAndAdvance(sessionId, terminId, terminId)`. Two feldmodus call sites gain an offline branch (enqueue + optimistic advance). Online behavior is byte-identical (online never passes the guard param → normal advance).

**Tech Stack:** TypeScript, Next.js 16 server actions, Supabase, the Slice 0/1 offline layer, Vitest (node) + fake-indexeddb.

## Global Constraints

- Branch `kitta/offline-first-slice1b-complete` (stacked off `kitta/offline-first-slice1-sv`); PR against the Slice 1 branch (stacked). Never `main` (Regel 1).
- `npm ci` in the worktree first (own node_modules).
- Test env = node. Dexie tests `import 'fake-indexeddb/auto'`.
- **No Postgres DDL.** Logic-only change to a server action + a client handler + 2 call sites. The `.is('abschluss_zeit', null)` is a query filter, not schema.
- **Behavior-preserving ONLINE:** the new param is OPTIONAL and defaults to no-guard; online callers don't pass it → advance runs exactly as today. The IF-NULL termin filter is a no-op on first completion (abschluss_zeit is null online) so it also preserves online behavior.
- `completeAndAdvance` is a `'use server'` action → per AGENTS.md the FULL build is authoritative (Next 16 build-time validation). Full build OOMs locally → CI is authoritative; locally run scoped tsc.
- Umlauts in any new user-visible string.
- CI ratchets stay green (knip/component-set/token-audit/status-registry).
- Grounding reference: `.superpowers/sdd/slice1b-grounding.md` (in the Slice 1 worktree).

## Injection facts (from grounding, verbatim)
- `completeAndAdvance(sessionId, terminId) => Promise<{success, error?, nextTerminId?}>` in `src/app/gutachter/feldmodus/actions.ts` (~lines 204-225). Sequence: `assertSvOwnsTermin(terminId)` → termin UPDATE `{abschluss_zeit, status:'abgeschlossen'}` → `transitionTagesSession(sessionId,'completing')` → `advanceToNextTermin(sessionId)` → revalidatePath ×2 → return. NOT transactional. Uses `admin` client for the termin write + `createClient()` for session reads.
- `advanceToNextTermin(sessionId)` in `src/lib/sv/tages-session.ts` (~142-168): reads fresh `aktueller_termin_id`, `indexOf` in `reihenfolge_termin_ids`, next = `[index+1] ?? null`; null → `transitionTagesSession('finished')`; else `transitionTagesSession('en_route', {aktueller_termin_id: next})`.
- `SvTagesSession.aktueller_termin_id: string | null` is the CAS field. Status enum: idle|en_route|arrived|completing|finished|paused.
- Call sites (both pass the CURRENTLY-active termin): `BesichtigungAbschliessenButton.tsx` (`handleClick` → `startTransition` → `completeAndAdvance(sessionId, terminId)` → `onAdvanced(res.nextTerminId ?? null)`); `AktuellerStopCard.tsx` `onAbschliessen()` (~287-299, same pattern with `stop.termin_id`).
- `FeldmodusClient.onAdvanced` ignores the arg → `goToStopIndex(aktuellerStopIndex + 1)`. So an offline `onAdvanced(null)` advances the UI correctly.

---

## Prerequisites
- [ ] **P1:** `npm ci` in the worktree. `npx vitest run src/lib/offline` green (Slice 0/1 tests inherited).

---

## Task 1: `shouldSkipAdvance` pure helper + CAS + IF-NULL in `completeAndAdvance`

**Files:** Modify `src/lib/sv/tages-session.ts` (add pure helper); Modify `src/app/gutachter/feldmodus/actions.ts` (use it). Test: `src/lib/sv/should-skip-advance.test.ts`.

**Interfaces — Produces:** `shouldSkipAdvance(currentAktuellerTerminId: string | null, expectedTerminId: string | undefined): boolean`; `completeAndAdvance(sessionId, terminId, expectedAktuellerTerminId?)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sv/should-skip-advance.test.ts
import { describe, it, expect } from 'vitest'
import { shouldSkipAdvance } from './tages-session'

describe('shouldSkipAdvance (CAS invariant)', () => {
  it('no guard requested (undefined expected) -> never skip', () => {
    expect(shouldSkipAdvance('t1', undefined)).toBe(false)
    expect(shouldSkipAdvance(null, undefined)).toBe(false)
  })
  it('session still on the completing termin -> do NOT skip (advance runs)', () => {
    expect(shouldSkipAdvance('t1', 't1')).toBe(false)
  })
  it('session already advanced past it -> SKIP (no double advance)', () => {
    expect(shouldSkipAdvance('t2', 't1')).toBe(true)
  })
  it('session finished (aktueller_termin_id null) -> SKIP', () => {
    expect(shouldSkipAdvance(null, 't1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/sv/should-skip-advance.test.ts`).

- [ ] **Step 3: Add the pure helper to `src/lib/sv/tages-session.ts`** (near the top exports; no Supabase inside it):

```ts
/**
 * CAS invariant for offline replay of completeAndAdvance.
 * Returns true when the session ADVANCE must be skipped because the session is
 * no longer on the termin being completed (already advanced / finished).
 * `expectedTerminId === undefined` means "no guard requested" (online path) -> never skip.
 */
export function shouldSkipAdvance(
  currentAktuellerTerminId: string | null,
  expectedTerminId: string | undefined,
): boolean {
  if (expectedTerminId === undefined) return false
  return currentAktuellerTerminId !== expectedTerminId
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Read `src/app/gutachter/feldmodus/actions.ts` `completeAndAdvance`** and modify it (adapt to the verbatim current code; keep the existing `admin`/`createClient` usage + auth guard + revalidatePath):
  1. Add the 3rd param + widen the return type:
```ts
export async function completeAndAdvance(
  sessionId: string,
  terminId: string,
  expectedAktuellerTerminId?: string,
): Promise<{ success: boolean; error?: string; nextTerminId?: string | null; skipped?: boolean }>
```
  2. Import the helper: `import { transitionTagesSession, advanceToNextTermin, shouldSkipAdvance } from '@/lib/sv/tages-session'` (add `shouldSkipAdvance` to the existing import).
  3. Add `.is('abschluss_zeit', null)` to the existing termin UPDATE filter (idempotent durable write). Example final form:
```ts
await admin
  .from('gutachter_termine')
  .update({ abschluss_zeit: new Date().toISOString(), status: 'abgeschlossen' })
  .eq('id', terminId)
  .is('abschluss_zeit', null)
```
  4. After the termin write and BEFORE `transitionTagesSession(sessionId, 'completing')`, insert the CAS guard:
```ts
if (expectedAktuellerTerminId !== undefined) {
  const supabase = await createClient()
  const { data: sess } = await supabase
    .from('sv_tages_session')
    .select('aktueller_termin_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (shouldSkipAdvance(sess?.aktueller_termin_id ?? null, expectedAktuellerTerminId)) {
    // Session already advanced past this termin (double replay / other device) -> no-op the advance.
    return { success: true, nextTerminId: null, skipped: true }
  }
}
```
  (Use the same `createClient` import the file already uses. If the file already creates a `supabase` user-client earlier, reuse it instead of a second `createClient()`.)
  5. Leave the rest (`transitionTagesSession('completing')` → `advanceToNextTermin` → revalidatePath → return) unchanged.

- [ ] **Step 6: Regression grep** — confirm no OTHER caller breaks on the new optional param:
`Select-String -Path (Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx).FullName -Pattern 'completeAndAdvance' | Select-Object Path,LineNumber`
Expected: only `actions.ts` (definition) + `BesichtigungAbschliessenButton.tsx` + `AktuellerStopCard.tsx` + this test. All existing callers pass 2 args (valid — 3rd is optional).

- [ ] **Step 7: Run the helper test + offline suite** → green. Commit:
```bash
git add src/lib/sv/tages-session.ts src/lib/sv/should-skip-advance.test.ts src/app/gutachter/feldmodus/actions.ts
git commit -m "feat(offline): completeAndAdvance CAS guard (expectedAktuellerTerminId) + IF-NULL termin write + shouldSkipAdvance helper"
```

---

## Task 2: offline handler `sv-complete-advance.ts` (Class C)

**Files:** Create `src/lib/offline/handlers/sv-complete-advance.ts` + test; Modify `src/lib/offline/handlers/index.ts`.

**Interfaces — Produces:** `svCompleteAdvanceHandler: OfflineHandler` (kind `sv_complete_advance`), self-registered; replays `completeAndAdvance(sessionId, terminId, terminId)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/handlers/sv-complete-advance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const caMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ completeAndAdvance: caMock }))
import { svCompleteAdvanceHandler } from './sv-complete-advance'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'sv_complete_advance', idempotency_key: 'k', replay_class: 'C',
  payload: { sessionId: 's1', terminId: 't1' }, entity_ref: { scope: 'feldmodus-session', id: 's1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => caMock.mockReset())

describe('svCompleteAdvanceHandler', () => {
  it('replays completeAndAdvance with terminId as the CAS expected -> done', async () => {
    caMock.mockResolvedValue({ success: true, nextTerminId: 't2' })
    expect(await svCompleteAdvanceHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(caMock).toHaveBeenCalledWith('s1', 't1', 't1')
  })
  it('skipped (already advanced) still returns done', async () => {
    caMock.mockResolvedValue({ success: true, nextTerminId: null, skipped: true })
    expect(await svCompleteAdvanceHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('failure -> retry', async () => {
    caMock.mockResolvedValue({ success: false, error: 'boom' })
    expect((await svCompleteAdvanceHandler.replay!(op)).outcome).toBe('retry')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/offline/handlers/sv-complete-advance.ts
'use client'
import { completeAndAdvance } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface CompleteAdvancePayload { sessionId: string; terminId: string }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as CompleteAdvancePayload
  // Pass terminId as expectedAktuellerTerminId -> CAS: a double replay whose session
  // already advanced past this termin is a no-op (skipped=true, still success).
  const res = await completeAndAdvance(p.sessionId, p.terminId, p.terminId)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Abschluss-Sync fehlgeschlagen' }
}

export const svCompleteAdvanceHandler: OfflineHandler = { kind: 'sv_complete_advance', replay }
registerHandler(svCompleteAdvanceHandler)
```

- [ ] **Step 4: Register in the barrel** (add alongside the existing imports; keep all others):
```ts
// src/lib/offline/handlers/index.ts
import './fall-dokument-upload'
import './gps-position'
import './sv-notizen'
import './sv-vor-ort'
import './besichtigung-gestartet'
import './sv-complete-advance'
export {}
```

- [ ] **Step 5: Run `npx vitest run src/lib/offline` → PASS.** Commit:
```bash
git add src/lib/offline/handlers/sv-complete-advance.ts src/lib/offline/handlers/sv-complete-advance.test.ts src/lib/offline/handlers/index.ts
git commit -m "feat(offline): sv_complete_advance handler (Class C, CAS via terminId)"
```

---

## Task 3: offline branches in the two call sites

**Files:** Modify `src/app/gutachter/feldmodus/BesichtigungAbschliessenButton.tsx` + `src/app/gutachter/feldmodus/AktuellerStopCard.tsx`. Read each first.

**Per site — add BEFORE the online `completeAndAdvance` call, inside the existing `startTransition` handler:**
```ts
if (!navigator.onLine) {
  void enqueueOp({
    kind: 'sv_complete_advance', replay_class: 'C',
    payload: { sessionId, terminId: <terminIdExpr> },
    entity_ref: { scope: 'feldmodus-session', id: sessionId },
  }).catch(() => {})
  toast.success('Abschluss offline gespeichert — wird synchronisiert')
  onAdvanced(null)   // optimistic UI advance (onAdvanced ignores the arg → index+1)
  return
}
// ...existing online: const res = await completeAndAdvance(sessionId, <terminIdExpr>); if (res.success) { toast...; onAdvanced(res.nextTerminId ?? null) } else {...}
```
- `BesichtigungAbschliessenButton`: `<terminIdExpr>` = `terminId` (prop). Import `enqueueOp` from `@/lib/offline/enqueue`. `toast`/`onAdvanced` already in scope (confirm).
- `AktuellerStopCard.onAbschliessen()`: `<terminIdExpr>` = `stop.termin_id`. `enqueueOp` may already be imported (Slice 1 added it) — reuse; else add. `onAdvanced`/`toast` already in scope.
- Keep the pflicht-docs confirm dialog logic (`pflichtOffen`/`confirming`) unchanged — the offline branch sits after that guard, inside the transition, same as online.

- [ ] **Step 1: Read + edit `BesichtigungAbschliessenButton.tsx`**, matching exact names.
- [ ] **Step 2: Read + edit `AktuellerStopCard.tsx`** `onAbschliessen`.
- [ ] **Step 3: `npx vitest run src/lib/offline` still green.** Commit `feat(offline): offline branch for completeAndAdvance at both call sites (enqueue + optimistic advance)`.

---

## Task 4: Verification + PR

- [ ] **Step 1: Offline suite** — `npx vitest run src/lib/offline` + `npx vitest run src/lib/sv/should-skip-advance.test.ts` → all green.
- [ ] **Step 2: Scoped tsc** — create `tsconfig.slice1b-check.json` (`extends ./tsconfig.json`, `noEmit`, include `src/lib/offline/**/*.ts`, `src/lib/sv/**/*.ts`, `src/app/gutachter/feldmodus/**/*.{ts,tsx}`); `npx tsc --noEmit -p tsconfig.slice1b-check.json` → 0 errors. Delete the temp tsconfig after (don't commit).
- [ ] **Step 3: Ratchets** — knip/component-set/token-audit/status-registry `--ratchet` → 0 new.
- [ ] **Step 4: Full regression** — `npm test`; confirm no NEW failures vs the known pre-existing env-flaky set (the 2 flaky-under-load files pass in isolation).
- [ ] **Step 5: Behavior-preserving reasoning (commit body):** online callers pass 2 args → `expectedAktuellerTerminId` undefined → `shouldSkipAdvance` returns false → advance runs as today; IF-NULL termin filter is a no-op on first completion. Offline: enqueue + optimistic `onAdvanced(null)`; replay passes terminId as CAS → double replay is a no-op.
- [ ] **Step 6: Push + PR** stacked on Slice 1:
```bash
git push -u origin kitta/offline-first-slice1b-complete
gh pr create --base kitta/offline-first-slice1-sv --title "feat(offline): Slice 1b - SV completeAndAdvance offline (CAS)" --body-file <body>
```
(Retarget to staging after Slice 1 #4216 merges.)

---

## Self-Review (plan author)
- **Spec coverage:** the deferred Slice-1b (spec §5 Class D — state-machine as compare-and-set) is implemented: durable termin write = idempotent (IF-NULL), session advance = CAS-guarded. ✓
- **Placeholders:** handler + helper code complete; the 2 server/component edits give exact insertion code + require reading the verbatim current code (unavoidable for live edits — flagged).
- **Type consistency:** kind `sv_complete_advance` matches handler/test/enqueue; `shouldSkipAdvance` signature consistent between test + helper + caller; the `expectedAktuellerTerminId` optional param preserves all existing 2-arg callers.
- **Risk:** the CAS pre-check is not a DB-atomic conditional UPDATE, so a true concurrent multi-device double-fire has a TOCTOU window (grounding G2). For the OFFLINE single-device sequential drain — the actual Slice-1b scenario — it is sufficient. A DB-level `UPDATE ... WHERE aktueller_termin_id = expected` would be the belt-and-suspenders follow-up (needs DDL/RPC → out of this no-DDL slice). Documented, not blocking.
