# Offline-First Slice 1 (SV read + safe writes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the SV field mode (Feldmodus) usable offline — read the active case (Fallakte), today's route + session from a local snapshot, and capture SV notes + arrival/inspection-start timestamps offline, syncing on reconnect. Built on the Slice 0 offline layer.

**Architecture:** Two offline-read consumers hydrate from the Dexie snapshot store (FeldmodusClient via server-prop `serverData`; SvFallakteView via a network-first/snapshot-fallback `reload`). Three new registry handlers replay the existing SV server actions on reconnect (notes = Class B / LWW, the two timestamps = Class C / guarded-idempotent). Realtime subscriptions are gated behind `useOnlineStatus`. `completeAndAdvance` stays online-only (Slice 1b).

**Tech Stack:** TypeScript, Dexie (Slice 0 layer), React 19 client components, Next.js 16 server actions, Vitest (node) + fake-indexeddb, Playwright (offline mode).

## Global Constraints

- Branch `kitta/offline-first-slice1-sv` (stacked off `kitta/offline-first-field-cache`); PR against **the Slice 0 branch** (stacked) or `staging` noting the #4194 dependency. Never `main` (Regel 1).
- Worktree has no `node_modules` -> `npm install` (or `npm ci`) first. `fake-indexeddb` is already a devDep (inherited from Slice 0).
- Test env = node (`vitest.config.ts`). Dexie tests `import 'fake-indexeddb/auto'`. React-hook/component DOM behavior is NOT unit-tested (no jsdom) — verified via Playwright offline mode + the pure cores.
- **No Postgres DDL.** Client IndexedDB + existing server actions only.
- **Behavior-preserving when ONLINE:** every changed component must behave exactly as today when `navigator.onLine`. Offline branches are additive.
- **Umlauts** in every new user-visible string (`ä/ö/ü/ß`) — these are feldmodus UI toasts/strips.
- CI ratchets stay green: knip (the re-added `useOfflineData` now HAS a consumer -> not unused), component-set, token-audit, status-registry.
- Full `tsc`/`build` OOM locally on this box (RAM-constrained) -> scoped tsc of the changed surface locally; full build authoritative on CI.
- Grounding reference (exact signatures/types/call-sites): the grounding map produced by the mapping agent (`slice1-grounding.md`). Key facts inlined below.

## Injection targets (from grounding, verbatim)

- `loadFeldmodusFallakteData(fallId) => Promise<{success:true; fall: FeldmodusFallakteFall; slots: FeldmodusSlot[]} | {success:false; error}>` — `src/app/gutachter/feldmodus/_fallakte/actions.ts`.
- `saveFeldmodusNotizen(fallId, notizen) => Promise<{success; error?}>` — same file. LWW.
- `markSvVorOrt(terminId, lat, lng, via) => Promise<{success; error?}>` — `src/app/gutachter/feldmodus/actions.ts`. Guard `IF !sv_angekommen_am`.
- `markBesichtigungGestartet(sessionId, terminId, via) => Promise<{success; error?}>` — same file. Guard `IF !besichtigung_gestartet_am`.
- Consumers: `SvFallakteView.tsx` (fallakte read + notes write), `FeldmodusClient.tsx` (stops+session read), `AktuellerStopCard.tsx` (the two timestamp writes).
- Snapshot keys: `feldmodus-fallakte:${fallId}`, `feldmodus-route:${svId}:${session.datum}`, session folded into the route snapshot value.

---

## Prerequisites

- [ ] **P1:** `npm install` in the worktree. Verify `npx vitest run src/lib/offline` is green (Slice 0 tests inherited).

---

## File Structure

**New:**
- `src/lib/offline/use-offline-data.ts` — re-add the hook (verbatim from Slice 0 commit dc7f3f889).
- `src/lib/offline/handlers/sv-notizen.ts` — Class B handler, replays `saveFeldmodusNotizen`, optimisticPatch on fallakte snapshot.
- `src/lib/offline/handlers/sv-vor-ort.ts` — Class C handler, replays `markSvVorOrt`, optimisticPatch on route snapshot.
- `src/lib/offline/handlers/besichtigung-gestartet.ts` — Class C handler, replays `markBesichtigungGestartet` (no snapshot patch).
- Test files alongside each handler.

**Modified:**
- `src/lib/offline/handlers/index.ts` — register the 3 new handlers.
- `src/app/gutachter/feldmodus/SvFallakteView.tsx` — offline reload + notes offline branch + Realtime guard + offline strip.
- `src/app/gutachter/feldmodus/FeldmodusClient.tsx` — snapshot stops+session, Realtime guard, ensure new kinds drain.
- `src/app/gutachter/feldmodus/AktuellerStopCard.tsx` — offline branches for the two timestamp writes.

---

## Task 1: Re-add `useOfflineData` hook

**Files:** Create `src/lib/offline/use-offline-data.ts`.

**Interfaces — Produces:** `useOfflineData<T>(key, {serverData?, scope, role}) => {data, source, staleSince}`.

- [ ] **Step 1: Write the file (verbatim from Slice 0)**

```ts
// src/lib/offline/use-offline-data.ts
'use client'
import { useEffect, useState } from 'react'
import { resolveOfflineData, saveSnapshot, readSnapshot } from './snapshot'

/**
 * Online-SSR/prop path: pass serverData -> snapshot persisted, source='live'.
 * Offline path: omit serverData -> reads snapshot, source='snapshot'|'empty'.
 * DOM behavior covered by Playwright (no jsdom in unit env).
 */
export function useOfflineData<T>(
  key: string,
  opts: { serverData?: T; scope: string; role: string },
): { data: T | null; source: 'live' | 'snapshot' | 'empty'; staleSince: number | null } {
  const [state, setState] = useState(() =>
    resolveOfflineData<T>({ serverData: opts.serverData, snapshot: null }),
  )
  useEffect(() => {
    let cancelled = false
    if (opts.serverData !== undefined) {
      void saveSnapshot({ key, scope: opts.scope, role: opts.role, data: opts.serverData })
      setState(resolveOfflineData<T>({ serverData: opts.serverData, snapshot: null }))
    } else {
      void readSnapshot(key).then((snap) => {
        if (!cancelled) setState(resolveOfflineData<T>({ snapshot: snap }))
      })
    }
    return () => { cancelled = true }
  }, [key, opts.scope, opts.role, opts.serverData])
  return state
}
```

- [ ] **Step 2:** Confirm the offline suite still imports snapshot cleanly: `npx vitest run src/lib/offline/snapshot.test.ts` -> PASS. (The hook itself is DOM — no unit test; its first consumer in Task 4 + Playwright cover it.)

- [ ] **Step 3: Commit**
```bash
git add src/lib/offline/use-offline-data.ts
git commit -m "feat(offline): re-add useOfflineData hook (Slice 1 consumer follows)"
```

---

## Task 2: Three SV offline write-handlers (Class B + C)

**Files:** Create `src/lib/offline/handlers/{sv-notizen,sv-vor-ort,besichtigung-gestartet}.ts` + tests; modify `handlers/index.ts`.

**Interfaces — Consumes:** `OfflineHandler`/`OutboxOp`/`ReplayResult` from `../ops`, `registerHandler` from `../registry`, the 3 server actions. **Produces:** three self-registered handlers with kinds `sv_notizen_vor_ort`, `sv_vor_ort`, `besichtigung_gestartet`.

- [ ] **Step 1: Write the failing test for `sv-notizen`**

```ts
// src/lib/offline/handlers/sv-notizen.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const saveMock = vi.fn()
vi.mock('@/app/gutachter/feldmodus/_fallakte/actions', () => ({ saveFeldmodusNotizen: saveMock }))
import { svNotizenHandler } from './sv-notizen'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'sv_notizen_vor_ort', idempotency_key: 'k', replay_class: 'B',
  payload: { fallId: 'f1', notizen: 'hallo' }, entity_ref: { scope: 'feldmodus-fallakte', id: 'f1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => saveMock.mockReset())

describe('svNotizenHandler', () => {
  it('replay calls saveFeldmodusNotizen and returns done on success', async () => {
    saveMock.mockResolvedValue({ success: true })
    expect(await svNotizenHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(saveMock).toHaveBeenCalledWith('f1', 'hallo')
  })
  it('returns retry on failure', async () => {
    saveMock.mockResolvedValue({ success: false, error: 'x' })
    expect((await svNotizenHandler.replay!(op)).outcome).toBe('retry')
  })
  it('optimisticPatch sets fall.sv_notizen_vor_ort', () => {
    const cur = { fall: { sv_notizen_vor_ort: 'old' }, slots: [] }
    const next = svNotizenHandler.optimisticPatch!(cur, op) as typeof cur
    expect(next.fall.sv_notizen_vor_ort).toBe('hallo')
  })
})
```

- [ ] **Step 2: Run -> FAIL** (`npx vitest run src/lib/offline/handlers/sv-notizen.test.ts`).

- [ ] **Step 3: Implement `sv-notizen.ts`**

```ts
// src/lib/offline/handlers/sv-notizen.ts
'use client'
import { saveFeldmodusNotizen } from '@/app/gutachter/feldmodus/_fallakte/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface NotizenPayload { fallId: string; notizen: string }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as NotizenPayload
  const res = await saveFeldmodusNotizen(p.fallId, p.notizen)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Notizen-Sync fehlgeschlagen' }
}

function optimisticPatch(current: unknown, op: OutboxOp): unknown {
  const p = op.payload as NotizenPayload
  const cur = current as { fall?: { sv_notizen_vor_ort?: string | null } } | null
  if (!cur?.fall) return current
  return { ...cur, fall: { ...cur.fall, sv_notizen_vor_ort: p.notizen } }
}

export const svNotizenHandler: OfflineHandler = { kind: 'sv_notizen_vor_ort', replay, optimisticPatch }
registerHandler(svNotizenHandler)
```

- [ ] **Step 4: Run -> PASS.**

- [ ] **Step 5: Write failing tests for `sv-vor-ort` + `besichtigung-gestartet`**

```ts
// src/lib/offline/handlers/sv-vor-ort.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const markMock = vi.fn()
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ markSvVorOrt: markMock, markBesichtigungGestartet: vi.fn() }))
import { svVorOrtHandler } from './sv-vor-ort'
import type { OutboxOp } from '../ops'
const op: OutboxOp = {
  id: 1, kind: 'sv_vor_ort', idempotency_key: 'k', replay_class: 'C',
  payload: { terminId: 't1', lat: 1, lng: 2, via: 'geofence' }, entity_ref: { scope: 'feldmodus-termin', id: 't1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => markMock.mockReset())
describe('svVorOrtHandler', () => {
  it('replays markSvVorOrt -> done', async () => {
    markMock.mockResolvedValue({ success: true })
    expect(await svVorOrtHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(markMock).toHaveBeenCalledWith('t1', 1, 2, 'geofence')
  })
  it('optimisticPatch stamps the matching route stop sv_angekommen_am', () => {
    const cur = { stops: [{ termin_id: 't1', sv_angekommen_am: null }, { termin_id: 't2', sv_angekommen_am: null }], session: {} }
    const next = svVorOrtHandler.optimisticPatch!(cur, op) as typeof cur
    expect(next.stops[0].sv_angekommen_am).not.toBeNull()
    expect(next.stops[1].sv_angekommen_am).toBeNull()
  })
})
```

```ts
// src/lib/offline/handlers/besichtigung-gestartet.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const markBesMock = vi.fn()
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ markSvVorOrt: vi.fn(), markBesichtigungGestartet: markBesMock }))
import { besichtigungGestartetHandler } from './besichtigung-gestartet'
import type { OutboxOp } from '../ops'
const op: OutboxOp = {
  id: 1, kind: 'besichtigung_gestartet', idempotency_key: 'k', replay_class: 'C',
  payload: { terminId: 't1', sessionId: 's1', via: 'manuell' }, entity_ref: { scope: 'feldmodus-termin', id: 't1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => markBesMock.mockReset())
describe('besichtigungGestartetHandler', () => {
  it('replays markBesichtigungGestartet -> done', async () => {
    markBesMock.mockResolvedValue({ success: true })
    expect(await besichtigungGestartetHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(markBesMock).toHaveBeenCalledWith('s1', 't1', 'manuell')
  })
  it('retry on failure', async () => {
    markBesMock.mockResolvedValue({ success: false, error: 'e' })
    expect((await besichtigungGestartetHandler.replay!(op)).outcome).toBe('retry')
  })
})
```

- [ ] **Step 6: Run -> FAIL.**

- [ ] **Step 7: Implement both handlers**

```ts
// src/lib/offline/handlers/sv-vor-ort.ts
'use client'
import { markSvVorOrt } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface VorOrtPayload { terminId: string; lat: number; lng: number; via: 'geofence' | 'manuell' }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as VorOrtPayload
  const res = await markSvVorOrt(p.terminId, p.lat, p.lng, p.via)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Ankunft-Sync fehlgeschlagen' }
}

function optimisticPatch(current: unknown, op: OutboxOp): unknown {
  const p = op.payload as VorOrtPayload
  const cur = current as { stops?: Array<{ termin_id: string; sv_angekommen_am: string | null }> } | null
  if (!cur?.stops) return current
  const now = new Date().toISOString()
  return {
    ...cur,
    stops: cur.stops.map((s) => (s.termin_id === p.terminId && !s.sv_angekommen_am ? { ...s, sv_angekommen_am: now } : s)),
  }
}

export const svVorOrtHandler: OfflineHandler = { kind: 'sv_vor_ort', replay, optimisticPatch }
registerHandler(svVorOrtHandler)
```

```ts
// src/lib/offline/handlers/besichtigung-gestartet.ts
'use client'
import { markBesichtigungGestartet } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface BesPayload { terminId: string; sessionId: string; via: 'beide_angekommen' | 'termin_uhrzeit' | 'manuell' }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as BesPayload
  const res = await markBesichtigungGestartet(p.sessionId, p.terminId, p.via)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Besichtigungsstart-Sync fehlgeschlagen' }
}

export const besichtigungGestartetHandler: OfflineHandler = { kind: 'besichtigung_gestartet', replay }
registerHandler(besichtigungGestartetHandler)
```

- [ ] **Step 8: Register in the barrel**
```ts
// src/lib/offline/handlers/index.ts — ADD these three imports (keep the existing two)
import './fall-dokument-upload'
import './gps-position'
import './sv-notizen'
import './sv-vor-ort'
import './besichtigung-gestartet'
export {}
```

- [ ] **Step 9: Run all handler + offline tests -> PASS**: `npx vitest run src/lib/offline`.

- [ ] **Step 10: Commit**
```bash
git add src/lib/offline/handlers/
git commit -m "feat(offline): SV write-handlers (notizen B, vor-ort C, besichtigung-gestartet C)"
```

---

## Task 3: `SvFallakteView` — offline read (Fallakte) + offline notes write

**Files:** Modify `src/app/gutachter/feldmodus/SvFallakteView.tsx`. Read the current file first.

**Precise changes (apply after reading the current code):**

1. Add imports:
```ts
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { saveSnapshot, readSnapshot } from '@/lib/offline/snapshot'
import { enqueueOp } from '@/lib/offline/enqueue'
```
2. Inside the component: `const online = useOnlineStatus()`. Add snapshot key `const snapKey = \`feldmodus-fallakte:${fallId}\``. Track staleness: `const [staleSince, setStaleSince] = useState<number | null>(null)`.
3. In `reload` (the `useCallback` that calls `loadFeldmodusFallakteData`), branch on connectivity:
```ts
const reload = useCallback(async () => {
  if (!navigator.onLine) {
    const snap = await readSnapshot(snapKey)
    if (snap) { const d = snap.data as { fall: FeldmodusFallakteFall; slots: FeldmodusSlot[] }; setFall(d.fall); setSlots(d.slots); setStaleSince(snap.saved_at) }
    return
  }
  const res = await loadFeldmodusFallakteData(fallId)
  if (res.success) {
    setFall(res.fall); setSlots(res.slots); setStaleSince(null)
    void saveSnapshot({ key: snapKey, scope: 'feldmodus', role: 'sv', data: { fall: res.fall, slots: res.slots } })
  } else { /* keep existing error handling */ }
}, [fallId, snapKey])
```
(Adapt `setFall`/`setSlots` to the current state-setter names — read the file.)
4. Guard the three Realtime subscriptions (the `useEffect` at ~lines 99-146): add `if (!online) return` at the top of that `useEffect` and include `online` in its deps.
5. In `handleSaveNotizen`, add the offline branch BEFORE the `await saveFeldmodusNotizen`:
```ts
if (!navigator.onLine) {
  await enqueueOp({
    kind: 'sv_notizen_vor_ort', replay_class: 'B',
    payload: { fallId, notizen }, entity_ref: { scope: 'feldmodus-fallakte', id: fallId },
  })
  setNotizenDirty(false)
  toast.success('Notizen offline gespeichert — wird synchronisiert')
  return
}
```
6. Render a stale strip when `staleSince != null`, above the content:
```tsx
{staleSince != null && (
  <div className="text-body-xs text-warning-strong bg-warning-soft px-3 py-1.5 rounded-ios-md">
    Offline — Stand {new Date(staleSince).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
  </div>
)}
```

- [ ] **Step 1: Read `SvFallakteView.tsx`** and apply, matching the current state-setter/handler names exactly.
- [ ] **Step 2: Scoped typecheck** (Task 6 tsconfig): the component compiles.
- [ ] **Step 3: Commit** `feat(offline): SvFallakteView offline read + offline notes (feldmodus)`.

---

## Task 4: `FeldmodusClient` — snapshot stops+session + Realtime guard + drain new kinds

**Files:** Modify `src/app/gutachter/feldmodus/FeldmodusClient.tsx`. Read first.

**Precise changes:**
1. Import `useOfflineData` + `useOnlineStatus` + `drainOutbox`:
```ts
import { useOfflineData } from '@/lib/offline/use-offline-data'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { drainOutbox } from '@/lib/offline/sync'
```
2. At the TOP of the component (before the `useState` initializers that read `session`/`stops`):
```ts
const online = useOnlineStatus()
const routeKey = `feldmodus-route:${sv.id}:${session.datum}`
const offlineRoute = useOfflineData<{ stops: FeldmodusStop[]; session: SvTagesSession }>(
  routeKey, { serverData: { stops, session }, scope: 'feldmodus', role: 'sv' },
)
const effectiveStops = offlineRoute.data?.stops ?? stops
const effectiveSession = offlineRoute.data?.session ?? session
```
Then use `effectiveStops`/`effectiveSession` in place of `stops`/`session` for the READ/derive paths (state initializers and derived values — read the file to swap the right references; do NOT touch the Realtime-writer paths).
3. Guard the `gutachter_termine` Realtime subscription (`useEffect` ~lines 211-241): `if (!online) return` + add `online` to deps.
4. Ensure the new write kinds drain on mount:
```ts
useEffect(() => { void drainOutbox().catch(() => {}) }, [])
```
(Keep the existing recoverOutbox/registerOnlineSync/syncOutbox calls — additive. `registerOnlineSync` already drains ALL kinds on the `online` event; this mount-drain covers the initial case.)
5. When `offlineRoute.source === 'snapshot'`, render an "Offline" indicator (reuse `OfflineStatusBanner` if mounted, else a small strip).

- [ ] **Step 1: Read `FeldmodusClient.tsx`** and apply, swapping only the READ/derive references.
- [ ] **Step 2: Scoped typecheck.**
- [ ] **Step 3: Commit** `feat(offline): FeldmodusClient snapshot stops+session + drain all kinds + realtime guard`.

---

## Task 5: `AktuellerStopCard` — offline arrival + inspection-start writes

**Files:** Modify `src/app/gutachter/feldmodus/AktuellerStopCard.tsx`. Read first.

**Precise changes:**
1. Import `enqueueOp` + `useOnlineStatus`; `const online = useOnlineStatus()`.
2. `markSvVorOrt` call site (Phase 1 geofence `useEffect`, ~line 174): wrap:
```ts
if (!navigator.onLine) {
  void enqueueOp({
    kind: 'sv_vor_ort', replay_class: 'C',
    payload: { terminId: stop.termin_id, lat: svPosition?.lat ?? stop.lat ?? 0, lng: svPosition?.lng ?? stop.lng ?? 0, via: 'geofence' },
    entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id },
  }).catch(() => { svVorOrtFiredRef.current = false })
} else {
  void markSvVorOrt(stop.termin_id, svPosition?.lat ?? stop.lat ?? 0, svPosition?.lng ?? stop.lng ?? 0, 'geofence')
    .catch(() => { svVorOrtFiredRef.current = false })
}
```
(Use `entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id }` — simple; the timestamp syncs and the existing optimistic UI already updates the visual arrival state. The route-snapshot patch is optional and only worth it if `svId`/`datum` are trivially in scope.)
3. `markBesichtigungGestartet` call sites (Phase 2 `useEffect` ~line 190; `onManuellAngekommen` ~line 231): wrap each:
```ts
if (!navigator.onLine) {
  void enqueueOp({
    kind: 'besichtigung_gestartet', replay_class: 'C',
    payload: { terminId: stop.termin_id, sessionId, via: 'beide_angekommen' /* or 'manuell' at the button site */ },
    entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id },
  })
  onArrived(/* same args as the online success path */)
} else {
  const res = await markBesichtigungGestartet(sessionId, stop.termin_id, 'manuell')
  if (res.success) onArrived(/* ... */)
}
```
Keep the existing optimistic `onArrived`/`setSessionStatus('arrived')` in both branches.

- [ ] **Step 1: Read `AktuellerStopCard.tsx`** and apply, matching exact prop/variable names (`svPosition`, `onArrived` args, `sessionId`).
- [ ] **Step 2: Scoped typecheck.**
- [ ] **Step 3: Commit** `feat(offline): AktuellerStopCard offline arrival + besichtigung-start writes`.

---

## Task 6: Verification + Playwright + PR

**Files:** none (verification) + optional Playwright spec.

- [ ] **Step 1: Offline unit suite** — `npx vitest run src/lib/offline` -> all green (Slice 0 + 3 new handler tests).
- [ ] **Step 2: Scoped typecheck** — create `tsconfig.slice1-check.json`:
```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true },
  "include": ["src/lib/offline/**/*.ts", "src/app/gutachter/feldmodus/**/*.tsx", "src/app/gutachter/feldmodus/**/*.ts"] }
```
`npx tsc --noEmit -p tsconfig.slice1-check.json` -> 0 errors. Delete the temp tsconfig after (do not commit it).
- [ ] **Step 3: Ratchets** — `npm run check:knip -- --ratchet` (useOfflineData now consumed -> 0 new), `npm run check:component-set -- --ratchet`, `npm run check:token-audit`, `npm run check:status-registry -- --ratchet` -> all 0 new.
- [ ] **Step 4: Full regression** — `npm test`; confirm the offline additions are green and the pre-existing env-failure count is unchanged (no NEW failures).
- [ ] **Step 5: Behavior-preserving reasoning** (into commit body): online path of each changed component unchanged (offline branches additive, gated on `!navigator.onLine`); Realtime still runs online; the 3 new kinds drain via `registerOnlineSync`+`drainOutbox`.
- [ ] **Step 6: Playwright offline smoke (best-effort, prod per mandate)** — if a feldmodus test login is available: `context.setOffline(true)`, open a Fallakte (assert renders from snapshot after a prior online visit), type notes (assert "offline gespeichert" toast), reconnect, assert the note persisted server-side. Else document manual steps + defer to review.
- [ ] **Step 7: Push + PR** (stacked on Slice 0):
```bash
git push -u origin kitta/offline-first-slice1-sv
gh pr create --base kitta/offline-first-field-cache --title "feat(offline): Slice 1 - SV offline read + safe writes (feldmodus)" --body-file <body>
```
(Base = Slice 0 branch so the PR shows only Slice 1's diff; retarget to staging after #4194 merges.)

---

## Self-Review (plan author)

- **Spec coverage:** Slice 1 (SV read + writes) — Read via useOfflineData/snapshot (Tasks 1,3,4), writes B/C via handlers (Task 2) wired at call sites (Tasks 3,5), Realtime gated (Tasks 3,4), useOfflineData re-added with consumer (Tasks 1,4). `completeAndAdvance` excluded (Slice 1b). ✓
- **Placeholders:** handler code complete; UI-edit tasks give exact injection code but require reading the current component to match local names (unavoidable for live-component edits — flagged per task).
- **Type consistency:** handler kinds (`sv_notizen_vor_ort`/`sv_vor_ort`/`besichtigung_gestartet`) consistent between handlers, tests, and call-site enqueue. `OutboxOp`/`ReplayResult`/`OfflineHandler` from Slice 0. snapshot keys consistent.
- **Open risk:** the route-snapshot optimisticPatch for `sv_vor_ort` depends on svId/datum in scope in AktuellerStopCard — Task 5 uses the safe `feldmodus-termin` entity_ref fallback (timestamp still syncs; existing optimistic UI covers the visual). No data-loss risk.
