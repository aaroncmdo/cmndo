# Offline-First Slice 2-write-1 (Kunde field-set offline capture) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** When a customer fills the `/flow/[token]` wizard and loses signal mid-flow, the two clean field-set writes (stammdaten + feststellung) queue offline and sync on reconnect; the termin step (needs live SV slots) blocks gracefully with a skip. No lost work for those fields.

**Architecture:** Two Class-B registry handlers replay the existing flow server actions on reconnect (the wizard's React state is the optimistic UI — no snapshot). Offline-enqueue branches are added at the exact call-sites. The termin render is gated behind `useOnlineStatus`, reusing the existing `onOhneTermin` skip. Same pattern as Slices 1/1b.

**Tech Stack:** TypeScript, the Slice 0 offline layer, React 19 client components (FlowWizardKfz), Next 16 server actions, Vitest (node).

## Global Constraints

- Branch `kitta/offline-first-slice2-write` (off Slice 0); PR against the Slice 0 branch (stacked) or `staging` noting #4194. Never `main` (Regel 1).
- **No Postgres DDL.** Client enqueue + existing server actions.
- **Behavior-preserving ONLINE:** offline branches gated on `!navigator.onLine`; online path unchanged. Umlauts in new user-visible strings.
- **Scope (grounding-informed):** ONLY `updateLeadStammdaten` + `speichereFeststellungFlow` are clean enqueue+advance. `quali`/`werkstatt`/`besichtigungsort` are server-decision/network-dependent → NOT enqueued (left as their current network-required behavior). `termin` → blocked offline with a skip. Photos + signature = later slices.
- **Accept (do NOT fix here):** the OfflineBanner reconnect COUNT (`getPendingCount`/`syncOutbox` are `fall_dokument_upload`-only) under-reports the new kinds. The ops STILL replay (registerOnlineSync → `drainOutbox()` unfiltered). Touching the shared Slice-0 sync/banner files is cross-lane risk; the global `<OfflineBanner/>` already shows the offline message. Document the under-count; don't change shared files.
- CI ratchets green (component-set: the new TerminOfflineHinweis must use tokens/primitives, not raw hex). Full build CI-authoritative (OOMs locally) → scoped tsc locally.
- Grounding: `.superpowers/sdd/slice2-write-grounding.md`.

## File Structure
- Create: `src/lib/offline/handlers/flow-field-sets.ts` (2 handlers: `flow_stammdaten` + `flow_feststellung`) + test.
- Modify: `src/lib/offline/handlers/index.ts` (register).
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (stammdaten call-site + service-autosave + termin-block + imports).
- Modify: `src/app/flow/[token]/FlowFeststellungStep.tsx` (3 feststellung call-sites).
- Create: `src/app/flow/[token]/TerminOfflineHinweis.tsx` (small offline-block card for the termin step).

---

## Prerequisites
- [ ] **P1:** `npm ci` in the worktree (done). `npx vitest run src/lib/offline` green.

---

## Task 1: Two Class-B flow field-set handlers

**Files:** Create `src/lib/offline/handlers/flow-field-sets.ts` + `flow-field-sets.test.ts`; Modify `handlers/index.ts`.

**Interfaces — Produces:** `flowStammdatenHandler` (kind `flow_stammdaten`) + `flowFeststellungHandler` (kind `flow_feststellung`), self-registered. Payloads: `{leadId, data, token}` / `{token, values}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/handlers/flow-field-sets.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const stammMock = vi.hoisted(() => vi.fn())
const festMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/flow/[token]/actions', () => ({ updateLeadStammdaten: stammMock }))
vi.mock('@/app/flow/[token]/self-service-feststellung-actions', () => ({ speichereFeststellungFlow: festMock }))
import { flowStammdatenHandler, flowFeststellungHandler } from './flow-field-sets'
import type { OutboxOp } from '../ops'

const base = { id: 1, idempotency_key: 'k', status: 'pending' as const, retry_count: 0, last_attempt_at: null, created_at: 1 }
const stammOp: OutboxOp = { ...base, kind: 'flow_stammdaten', replay_class: 'B', payload: { leadId: 'l1', data: { vorname: 'A' }, token: 't' } }
const festOp: OutboxOp = { ...base, kind: 'flow_feststellung', replay_class: 'B', payload: { token: 't', values: { x: 1 } } }
beforeEach(() => { stammMock.mockReset(); festMock.mockReset() })

describe('flowStammdatenHandler', () => {
  it('replays updateLeadStammdaten(leadId,data,token) -> done', async () => {
    stammMock.mockResolvedValue({ success: true })
    expect(await flowStammdatenHandler.replay!(stammOp)).toEqual({ outcome: 'done' })
    expect(stammMock).toHaveBeenCalledWith('l1', { vorname: 'A' }, 't')
  })
  it('server {success:false} (e.g. token expired) -> conflict (drop, no infinite retry)', async () => {
    stammMock.mockResolvedValue({ success: false, error: 'Link abgelaufen' })
    expect((await flowStammdatenHandler.replay!(stammOp)).outcome).toBe('conflict')
  })
  it('network throw -> retry', async () => {
    stammMock.mockRejectedValue(new Error('net'))
    expect((await flowStammdatenHandler.replay!(stammOp)).outcome).toBe('retry')
  })
})

describe('flowFeststellungHandler', () => {
  it('replays speichereFeststellungFlow(token,values) -> done', async () => {
    festMock.mockResolvedValue({ ok: true })
    expect(await flowFeststellungHandler.replay!(festOp)).toEqual({ outcome: 'done' })
    expect(festMock).toHaveBeenCalledWith('t', { x: 1 })
  })
  it('server {ok:false} -> conflict; network throw -> retry', async () => {
    festMock.mockResolvedValue({ ok: false, error: 'x' })
    expect((await flowFeststellungHandler.replay!(festOp)).outcome).toBe('conflict')
    festMock.mockRejectedValue(new Error('net'))
    expect((await flowFeststellungHandler.replay!(festOp)).outcome).toBe('retry')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/offline/handlers/flow-field-sets.ts
'use client'
import { updateLeadStammdaten } from '@/app/flow/[token]/actions'
import { speichereFeststellungFlow } from '@/app/flow/[token]/self-service-feststellung-actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface StammdatenPayload {
  leadId: string
  data: { vorname?: string; nachname?: string; telefon?: string; email?: string }
  token: string
}
interface FeststellungPayload { token: string; values: Record<string, unknown> }

// Klassifikation (grounding E.2): Netzwerk-Wurf -> retry (Backoff); server {success/ok:false}
// (Token abgelaufen / nicht autorisiert = nicht-transient bei LWW-Field-Writes) -> conflict (droppen,
// kein endloses Retry).
async function replayStammdaten(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as StammdatenPayload
  try {
    const res = await updateLeadStammdaten(p.leadId, p.data, p.token)
    return res.success ? { outcome: 'done' } : { outcome: 'conflict', error: res.error ?? 'Stammdaten-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

async function replayFeststellung(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as FeststellungPayload
  try {
    const res = await speichereFeststellungFlow(p.token, p.values)
    return res.ok ? { outcome: 'done' } : { outcome: 'conflict', error: res.error ?? 'Feststellung-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

export const flowStammdatenHandler: OfflineHandler = { kind: 'flow_stammdaten', replay: replayStammdaten }
export const flowFeststellungHandler: OfflineHandler = { kind: 'flow_feststellung', replay: replayFeststellung }
registerHandler(flowStammdatenHandler)
registerHandler(flowFeststellungHandler)
```

- [ ] **Step 4: Register in the barrel** (add alongside existing imports):
```ts
// src/lib/offline/handlers/index.ts
import './fall-dokument-upload'
import './gps-position'
import './flow-field-sets'
export {}
```
(NOTE: this branch is off Slice 0, so the barrel has only the 2 Slice-0 handlers — the SV handlers from Slice 1/1b are NOT here. Only add `./flow-field-sets`.)

- [ ] **Step 5: Run `npx vitest run src/lib/offline` → PASS.** Commit `feat(offline): flow field-set handlers (flow_stammdaten + flow_feststellung, Class B)`.

---

## Task 2: Wire offline branches at the 4 field-set call-sites

**Files:** Modify `FlowWizardKfz.tsx` + `FlowFeststellungStep.tsx`. Read each first.

**FlowWizardKfz.tsx:**
1. Add imports: `import { useOnlineStatus } from '@/lib/offline/use-online-status'` + `import { enqueueOp } from '@/lib/offline/enqueue'`. (`toast` not needed — the global OfflineBanner covers messaging; keep the existing inline patterns.)
2. In the component body add `const isOnline = useOnlineStatus()` (used for the termin gate in Task 3; the call-site enqueue uses raw `navigator.onLine`).
3. **stammdaten call-site (~L886-892):** wrap the `updateLeadStammdaten` block:
```ts
if (editVorname !== lead.vorname || editNachname !== lead.nachname || editTelefon !== lead.telefon || editEmail !== lead.email) {
  const data = { vorname: editVorname, nachname: editNachname, telefon: editTelefon, email: editEmail }
  if (!navigator.onLine) {
    void enqueueOp({ kind: 'flow_stammdaten', replay_class: 'B', payload: { leadId: lead.id, data, token }, entity_ref: { scope: 'lead', id: lead.id } }).catch(() => {})
  } else {
    try { await updateLeadStammdaten(lead.id, data, token) } catch { /* weiter trotzdem */ }
  }
  setAccountEmail(editEmail)
}
setStepIndex(stepIndex + 1)
```
4. **service-autosave call-site (`setServiceFeld` ~L228-234):** wrap the `void speichereFeststellungFlow(token, next).catch(()=>{})`:
```ts
if (!navigator.onLine) {
  void enqueueOp({ kind: 'flow_feststellung', replay_class: 'B', payload: { token, values: next } }).catch(() => {})
} else {
  void speichereFeststellungFlow(token, next).catch(() => {})
}
```
(`speichereFeststellungFlow` is already imported in FlowWizardKfz for this autosave — confirm; if not, keep the existing import.)

**FlowFeststellungStep.tsx** (3 call-sites — read the file, it takes `token` + `values`; NO leadId prop → omit entity_ref):
5. **autosave `handleWeiter` non-last (~L148):** `void speichereFeststellungFlow(token, values).catch(()=>{})` → offline-branch to `enqueueOp({kind:'flow_feststellung', replay_class:'B', payload:{token, values}})`.
6. **blocking last-step (~L155):** `const res = await speichereFeststellungFlow(token, values)` → offline: `void enqueueOp({kind:'flow_feststellung', replay_class:'B', payload:{token, values}}).catch(()=>{}); onWeiter(); return` BEFORE the online `await`.
7. **`handleSkipAll` (~L169):** `void speichereFeststellungFlow(token, values).catch(()=>{})` → same offline-branch as #5.
   Add `import { enqueueOp } from '@/lib/offline/enqueue'` to FlowFeststellungStep.

- [ ] **Step 1: Read + edit `FlowWizardKfz.tsx`** (stammdaten + service-autosave + imports), matching exact local names.
- [ ] **Step 2: Read + edit `FlowFeststellungStep.tsx`** (3 feststellung call-sites + import).
- [ ] **Step 3: `npx vitest run src/lib/offline` still green.** Commit `feat(offline): offline-enqueue at flow stammdaten + feststellung call-sites`.

---

## Task 3: Block the termin step offline (graceful skip)

**Files:** Create `src/app/flow/[token]/TerminOfflineHinweis.tsx`; Modify `FlowWizardKfz.tsx` (guard the termin render ~L559-571).

- [ ] **Step 1: Create `TerminOfflineHinweis.tsx`** (token-styled, no raw hex — use `bg-warning-soft`/`text-warning-strong` + a primitives Button OR a plain token-styled button; check the file's neighbors for the button pattern). Content:
```tsx
'use client'
export default function TerminOfflineHinweis({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="rounded-ios-xl border border-warning/30 bg-warning-soft p-4 text-center space-y-3">
      <p className="text-body-sm text-warning-strong">
        Terminbuchung ist nur mit Internetverbindung möglich. Ihre Angaben sind gespeichert — Sie können den Termin gleich vereinbaren, sobald Sie wieder online sind.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="w-full py-3 rounded-ios-xl text-sm font-semibold bg-claimondo-navy text-white hover:bg-claimondo-navy/90"
      >
        Ohne Termin fortfahren
      </button>
    </div>
  )
}
```
(Verify `bg-warning-soft`/`text-warning-strong`/`rounded-ios-xl` are the current tokens; adapt the button to whatever primitive/pattern the flow uses if the component-set ratchet flags a hand-rolled button — the flow already hand-rolls buttons per the grounding, so a token-styled `<button>` matches the file's convention.)

- [ ] **Step 2: Guard the termin render in FlowWizardKfz** (~L559-571): wrap the `<FlowSlotStep .../>` render with the online check, reusing the existing `onOhneTermin` semantics for the skip:
```tsx
{currentStep.id === 'termin' && (
  !isOnline ? (
    <TerminOfflineHinweis onSkip={() => { setOhneTermin(true); setStepIndex(stepIndexById('sa')) }} />
  ) : (
    <FlowSlotStep token={token} onGebucht={/* existing */} onOhneTermin={/* existing */} />
  )
)}
```
(Match the EXACT existing `onGebucht`/`onOhneTermin` handlers — read the current render block. `setOhneTermin`/`stepIndexById('sa')` are the same the existing `onOhneTermin` uses.) Import the new component.

- [ ] **Step 3: `npx vitest run src/lib/offline` green.** Commit `feat(offline): block termin step offline with graceful skip (TerminOfflineHinweis)`.

---

## Task 4: Verification + PR

- [ ] **Step 1: Offline suite** — `npx vitest run src/lib/offline` → green (incl. the 2 new handler tests, kinds not overlapping Slice-0).
- [ ] **Step 2: Scoped tsc** — temp `tsconfig.w1-check.json` (`extends`, `noEmit`, include `src/lib/offline/**/*.ts` + `src/app/flow/[token]/**/*.tsx` + `src/app/flow/[token]/**/*.ts`); `npx tsc --noEmit -p ...` → 0 errors; delete temp.
- [ ] **Step 3: Ratchets** — knip / token-audit / component-set / status-registry `--ratchet` → 0 new. (Watch component-set for the new TerminOfflineHinweis button + token-audit for any hex.)
- [ ] **Step 4: Full regression** — `npm test`; confirm no NEW failures vs the known env-flaky set.
- [ ] **Step 5: Behavior-preserving reasoning (commit body):** online path unchanged (offline branches gated on `!navigator.onLine`); termin gate only changes the OFFLINE render (online still shows FlowSlotStep); quali/werkstatt untouched (still network-required, as today); the OfflineBanner under-count is accepted+documented (ops still replay via unfiltered drainOutbox).
- [ ] **Step 6: Push + PR** stacked on Slice 0:
```bash
git push -u origin kitta/offline-first-slice2-write
gh pr create --base kitta/offline-first-field-cache --title "feat(offline): Slice 2-write-1 - Kunde field-set offline capture" --body-file <body>
```

---

## Self-Review (plan author)
- **Spec coverage:** the 2 clean field-sets (stammdaten Task 2, feststellung Tasks 1-2) + handlers (Task 1) + termin-block (Task 3) + the grounding's block/skip verdicts for quali/werkstatt/besichtigungsort (explicitly out — not enqueued) + the accepted OfflineBanner under-count. ✓
- **Placeholders:** handler + test + TerminOfflineHinweis code complete; the call-site edits give exact injection code but require reading the live components to match names (unavoidable; flagged).
- **Type consistency:** kinds `flow_stammdaten`/`flow_feststellung` match handler/test/enqueue; payload shapes `{leadId,data,token}`/`{token,values}` consistent between handler + call-sites; `updateLeadStammdaten` returns `{success}`, `speichereFeststellungFlow` returns `{ok}` — handlers read the right field each.
- **Risk:** quali offline still errors as today (needs server decision) — NOT made worse, but not graceful; a graceful quali/werkstatt offline-block is deferred polish. Documented.
