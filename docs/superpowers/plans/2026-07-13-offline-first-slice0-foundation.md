# Offline-First Slice 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the existing 2-purpose offline outbox (document upload + GPS) into one typed `mutation_outbox` + handler-registry + snapshot store, **behavior-preserving** for the SV field mode, so later slices can add offline capture/read for any field operation.

**Architecture:** One Dexie/IndexedDB layer with two halves — a **mutation outbox** (typed ops dispatched through a handler registry, generic drain with single- and batch-replay) and a **snapshot store** (view-through cache for offline reads). Pure decision logic (backoff, dead-letter, replay-readiness, data resolution) is separated from Dexie I/O so it is node-unit-testable. Existing consumers keep working via thin back-compat shims; the two existing write paths (`fall_dokument_upload`, `gps_position`) become the first two registry handlers.

**Tech Stack:** TypeScript, Dexie 4 (IndexedDB), React 19 client hooks, Supabase JS, Vitest (node env), `fake-indexeddb` (new devDep, test-only), Next.js 16.

## Global Constraints

- **Regel 1:** work on branch `kitta/offline-first-field-cache`, PR against `staging`, never push `main`. (This worktree is already on that branch, off `origin/staging`.)
- **Regel 2 (DDL):** Slice 0 contains **NO Postgres DDL** — `mutation_outbox`/`snapshots` are client-side IndexedDB object stores (Dexie), not database tables. If any task appears to need a Postgres column, STOP and escalate (would go via `mcp__plugin_supabase_supabase__apply_migration`, not here).
- **Worktree has no `node_modules`** (git worktree checks out tracked files only) → run `npm install` before any test/build.
- **Test env is node** (`vitest.config.ts`: `environment: 'node'`, no jsdom). Dexie-touching tests MUST `import 'fake-indexeddb/auto'` at the top of the test file. React-hook DOM behavior is NOT unit-tested here (no jsdom) — pure cores are tested instead; hooks are exercised by Playwright in later slices.
- **Behavior-preserving gate:** the SV field mode (document upload offline + GPS batch) must behave identically after Slice 0. This is the acceptance bar for the whole slice.
- **Umlauts** in any user-visible string (`ä/ö/ü/ß`); backend/comments/commits may be ASCII.
- **CI ratchets stay green:** `npm run check:knip -- --ratchet` (new devDep `fake-indexeddb` is imported by tests → not "unused"; if knip flags it, add to `WHITELISTED_DEPS` with reason), `npm run check:component-set`, `npm run check:token-audit`, `npm run check:status-registry`.
- **No new server actions** in this slice; handlers call existing Supabase Storage/table APIs and the existing `/api/sv/position-batch` route.
- **Commit after every task** with the 7-point audit stanza in the body (see AGENTS.md format).

---

## Prerequisites (do once, before Task 1)

- [ ] **P1: Install deps in the worktree**

Run: `npm install`
Expected: completes; `node_modules/` populated.

- [ ] **P2: Add `fake-indexeddb` as a dev dependency**

Run: `npm install --save-dev fake-indexeddb@^6`
Expected: `package.json` devDependencies now include `fake-indexeddb`.

- [ ] **P3: Verify the test baseline is green**

Run: `npm test`
Expected: existing suite PASSES (no offline tests yet). Note the passing count for regression comparison.

- [ ] **P4: Commit the dependency addition**

```bash
git add package.json package-lock.json
git commit -m "chore(offline): add fake-indexeddb devDep for Dexie unit tests"
```

---

## File Structure

**New files (`src/lib/offline/`):**
- `ops.ts` — pure types + constants + pure decision helpers (backoff, retry-readiness, dead-letter transition, uuid). No Dexie import.
- `db.ts` — Dexie schema v3 (`mutation_outbox` + `snapshots`, keeps v1/v2 for migration), pure row-mappers (`uploadToOp`/`gpsToOp`), v2→v3 migration.
- `registry.ts` — in-memory handler registry (`registerHandler`/`getHandler`/`getRegisteredKinds`/`clearHandlers`).
- `snapshot.ts` — snapshot store (`saveSnapshot`/`readSnapshot`/`touchSnapshot`/`evictLRU`) + pure `resolveOfflineData`.
- `use-offline-data.ts` — thin React hook wrapping `resolveOfflineData` + snapshot I/O.
- `enqueue.ts` — `enqueueOp` (+ optimistic snapshot patch), status CRUD (`markOp`/`removeOp`/`getPendingOps`/`getPendingCountByKind`/`getDeadCount`/`resetDeadLetter`/`recoverOutbox`), `requestPersistIfPossible`.
- `sync.ts` — `drainOutbox` (groups by kind → single `replay` or batch `drainBatch`, backoff-gated, dead-letter) + `registerOnlineSync`.
- `handlers/fall-dokument-upload.ts` — Class-A handler (ported from `sync-outbox.ts#uploadSingleItem`), self-registers.
- `handlers/gps-position.ts` — batch handler (ported from `sync-gps-outbox.ts`), self-registers.
- `handlers/index.ts` — imports both handlers for their registration side-effects.

**Rewritten to thin delegating shims (same path, same exports):**
- `outbox.ts` — re-exports `offlineDB`, `generateUuid`, `MAX_RETRIES`; `addToOutbox`/`addGpsPosition` delegate to `enqueueOp`; `getPendingCount`/`getGpsPendingCount`/`getDeadCount`/`getOutboxItems`/`updateOutboxStatus`/`removeFromOutbox`/`resetDeadLetter`/`recoverOutbox` delegate to the new layer with compat mapping; keeps `OutboxItem`/`GpsOutboxItem`/`OutboxStatus` types.
- `sync-outbox.ts` — `syncOutbox` → `drainOutbox({ kinds:['fall_dokument_upload'] })`; keeps `getBackoff`, `registerOnlineSync`.
- `sync-gps-outbox.ts` — `syncGpsOutbox` → `drainOutbox({ kinds:['gps_position'] })`; keeps `registerGpsOnlineSync`, re-exports `getGpsPendingCount`.

**Updated consumers (direct table access / sync call):**
- `use-pending-count.ts` — `useSlotPending` queries `mutation_outbox` (was `upload_outbox`).
- `components/offline/DeadLetterDialog.tsx` — dead-list query targets `mutation_outbox`; renders from compat fields.
- `lib/offline/register-sw.ts` — `OUTBOX_SYNC` message → `drainOutbox()` (was `syncOutbox`+`syncGpsOutbox`).

**Unchanged consumers (work via shims):** `components/faelle/FallDokumentDropzone.tsx`, `app/gutachter/feldmodus/useFieldTracking.ts`, `components/offline/OutboxBadge.tsx`, `app/gutachter/feldmodus/OfflineStatusBanner.tsx`, `components/offline/ServiceWorkerBoot.tsx`.

---

## Task 1: `ops.ts` — pure types + decision helpers

**Files:**
- Create: `src/lib/offline/ops.ts`
- Test: `src/lib/offline/ops.test.ts`

**Interfaces:**
- Produces: `OutboxStatus`, `ReplayClass`, `OutboxOp`, `ReplayResult`, `OfflineHandler`, `MAX_RETRIES`, `BACKOFF_MS`, `getBackoff(retryCount)`, `isReadyForRetry(op, now)`, `nextStatusAfterFailure(retryCount)`, `generateUuid()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/ops.test.ts
import { describe, it, expect } from 'vitest'
import { getBackoff, isReadyForRetry, nextStatusAfterFailure, MAX_RETRIES } from './ops'

describe('getBackoff', () => {
  it('ramps and caps at 10min', () => {
    expect(getBackoff(0)).toBe(1000)
    expect(getBackoff(3)).toBe(120000)
    expect(getBackoff(99)).toBe(600000)
  })
})

describe('isReadyForRetry', () => {
  it('pending is always ready', () => {
    expect(isReadyForRetry({ status: 'pending', retry_count: 5, last_attempt_at: 1 }, 1_000_000)).toBe(true)
  })
  it('failed waits for backoff window', () => {
    const op = { status: 'failed' as const, retry_count: 1, last_attempt_at: 1_000_000 }
    expect(isReadyForRetry(op, 1_000_000 + 4000)).toBe(false) // < 5s
    expect(isReadyForRetry(op, 1_000_000 + 6000)).toBe(true)  // >= 5s
  })
})

describe('nextStatusAfterFailure', () => {
  it('becomes dead at MAX_RETRIES', () => {
    expect(nextStatusAfterFailure(0)).toEqual({ status: 'failed', retry_count: 1 })
    expect(nextStatusAfterFailure(MAX_RETRIES - 1)).toEqual({ status: 'dead', retry_count: MAX_RETRIES })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/ops.test.ts`
Expected: FAIL — "Cannot find module './ops'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/ops.ts
// Pure offline-layer types + decision helpers. NO Dexie / DOM imports —
// safe to unit-test in node. Consolidates backoff + dead-letter logic that
// was duplicated across outbox.ts / sync-outbox.ts / sync-gps-outbox.ts.

export type OutboxStatus = 'pending' | 'uploading' | 'failed' | 'dead'
export type ReplayClass = 'A' | 'B' | 'C' | 'D'

export const MAX_RETRIES = 10
export const BACKOFF_MS = [1000, 5000, 30000, 120000, 600000]

export function getBackoff(retryCount: number): number {
  return BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)]
}

export interface OutboxOp {
  id?: number
  kind: string
  idempotency_key: string
  replay_class: ReplayClass
  payload: unknown
  blob?: Blob
  blob_meta?: { file_name: string; content_type: string; file_size: number }
  entity_ref?: { scope: string; id: string }
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

export type ReplayResult =
  | { outcome: 'done' }
  | { outcome: 'retry'; error: string }
  | { outcome: 'conflict'; error: string }

export interface OfflineHandler {
  kind: string
  /** Per-item replay (Classes A/B/C/D). Provide this OR drainBatch. */
  replay?(op: OutboxOp): Promise<ReplayResult>
  /** Batch replay (e.g. GPS). Returns the ids that are done vs. still failed. */
  drainBatch?(ops: OutboxOp[]): Promise<{ done: number[]; failed: number[]; error?: string }>
  /** Optional optimistic local snapshot patch on enqueue. */
  optimisticPatch?(current: unknown, op: OutboxOp): unknown
}

export function isReadyForRetry(
  op: Pick<OutboxOp, 'status' | 'retry_count' | 'last_attempt_at'>,
  now: number,
): boolean {
  if (op.status !== 'failed') return true
  if (op.retry_count === 0) return true
  const since = op.last_attempt_at != null ? now - op.last_attempt_at : Infinity
  return since >= getBackoff(op.retry_count)
}

export function nextStatusAfterFailure(retryCount: number): {
  status: OutboxStatus
  retry_count: number
} {
  const rc = retryCount + 1
  return { status: rc >= MAX_RETRIES ? 'dead' : 'failed', retry_count: rc }
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/ops.test.ts`
Expected: PASS (3 files/… tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/ops.ts src/lib/offline/ops.test.ts
git commit -m "feat(offline): pure ops module (types + backoff + dead-letter helpers)"
```

---

## Task 2: `db.ts` — Dexie v3 schema + pure mappers + migration

**Files:**
- Create: `src/lib/offline/db.ts`
- Test: `src/lib/offline/db.test.ts`

**Interfaces:**
- Consumes: `OutboxOp`, `OutboxStatus` from `./ops`.
- Produces: `offlineDB` (Dexie instance with `mutation_outbox`, `snapshots`, legacy `upload_outbox`/`gps_outbox`), `Snapshot` type, `LegacyUploadItem`/`LegacyGpsItem` types, pure `uploadToOp(u)`/`gpsToOp(g)` mappers.

- [ ] **Step 1: Write the failing test (pure mappers first)**

```ts
// src/lib/offline/db.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { uploadToOp, gpsToOp } from './db'

describe('uploadToOp', () => {
  it('maps a legacy upload row to a Class-A op with blob + blob_meta', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const op = uploadToOp({
      id: 7, idempotency_key: 'k1', fall_id: 'f1', dokument_typ: 'schadensfoto',
      file_blob: blob, file_name: 'a.png', file_size: 1, content_type: 'image/png',
      ist_pflicht: true, ab_phase: null, created_at: 111, status: 'pending',
      retry_count: 2, last_attempt_at: 99, last_error: 'e',
    })
    expect(op.kind).toBe('fall_dokument_upload')
    expect(op.replay_class).toBe('A')
    expect(op.idempotency_key).toBe('k1')
    expect(op.blob).toBe(blob)
    expect(op.blob_meta).toEqual({ file_name: 'a.png', content_type: 'image/png', file_size: 1 })
    expect(op.payload).toEqual({ fall_id: 'f1', dokument_typ: 'schadensfoto', ist_pflicht: true, ab_phase: null })
    expect(op.entity_ref).toEqual({ scope: 'fall', id: 'f1' })
    expect(op.retry_count).toBe(2)
    expect(op.status).toBe('pending')
  })
})

describe('gpsToOp', () => {
  it('maps a legacy gps row to a Class-A op with sv payload', () => {
    const op = gpsToOp({
      id: 3, idempotency_key: 'g1', sv_id: 'sv1', termin_id: 't1', lat: 1, lng: 2,
      accuracy_m: 5, heading: null, speed_kmh: null, captured_at: 222,
      status: 'failed', retry_count: 1, last_attempt_at: 5, created_at: 222,
    })
    expect(op.kind).toBe('gps_position')
    expect(op.replay_class).toBe('A')
    expect(op.payload).toMatchObject({ sv_id: 'sv1', termin_id: 't1', lat: 1, lng: 2, captured_at: 222 })
    expect(op.blob).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/db.test.ts`
Expected: FAIL — "Cannot find module './db'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/db.ts
// Dexie schema. v1/v2 kept verbatim for migration; v3 introduces the
// generalized mutation_outbox + snapshots and migrates existing rows.
import Dexie, { type Table } from 'dexie'
import type { OutboxOp, OutboxStatus } from './ops'

export interface Snapshot {
  key: string
  scope: string
  role: string
  data: unknown
  saved_at: number
  last_read_at: number
}

export interface LegacyUploadItem {
  id?: number
  idempotency_key: string
  fall_id: string
  dokument_typ: string
  file_blob: Blob
  file_name: string
  file_size: number
  content_type: string
  ist_pflicht: boolean
  ab_phase: string | null
  created_at: number
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
}

export interface LegacyGpsItem {
  id?: number
  idempotency_key: string
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

export function uploadToOp(u: LegacyUploadItem): OutboxOp {
  return {
    kind: 'fall_dokument_upload',
    idempotency_key: u.idempotency_key,
    replay_class: 'A',
    payload: {
      fall_id: u.fall_id,
      dokument_typ: u.dokument_typ,
      ist_pflicht: u.ist_pflicht,
      ab_phase: u.ab_phase,
    },
    blob: u.file_blob,
    blob_meta: { file_name: u.file_name, content_type: u.content_type, file_size: u.file_size },
    entity_ref: { scope: 'fall', id: u.fall_id },
    status: u.status,
    retry_count: u.retry_count,
    last_attempt_at: u.last_attempt_at,
    last_error: u.last_error,
    created_at: u.created_at,
  }
}

export function gpsToOp(g: LegacyGpsItem): OutboxOp {
  return {
    kind: 'gps_position',
    idempotency_key: g.idempotency_key,
    replay_class: 'A',
    payload: {
      sv_id: g.sv_id,
      termin_id: g.termin_id,
      lat: g.lat,
      lng: g.lng,
      accuracy_m: g.accuracy_m,
      heading: g.heading,
      speed_kmh: g.speed_kmh,
      captured_at: g.captured_at,
    },
    status: g.status,
    retry_count: g.retry_count,
    last_attempt_at: g.last_attempt_at,
    last_error: g.last_error,
    created_at: g.created_at,
  }
}

class ClaimondoOfflineDB extends Dexie {
  upload_outbox!: Table<LegacyUploadItem, number>
  gps_outbox!: Table<LegacyGpsItem, number>
  mutation_outbox!: Table<OutboxOp, number>
  snapshots!: Table<Snapshot, string>

  constructor() {
    super('ClaimondoOffline')

    // v1 (KFZ-180)
    this.version(1).stores({ upload_outbox: '++id, fall_id, status, created_at' })

    // v2 (AAR-388)
    this.version(2)
      .stores({
        upload_outbox: '++id, fall_id, status, created_at, last_attempt_at, idempotency_key',
        gps_outbox: '++id, sv_id, status, captured_at, last_attempt_at, idempotency_key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('upload_outbox')
          .toCollection()
          .modify((item: LegacyUploadItem) => {
            if (!item.idempotency_key) item.idempotency_key = crypto.randomUUID()
            if (item.last_attempt_at === undefined) item.last_attempt_at = null
          })
      })

    // v3 (offline-first foundation) — generalized outbox + snapshots
    this.version(3)
      .stores({
        mutation_outbox: '++id, kind, status, created_at, last_attempt_at, idempotency_key',
        snapshots: 'key, scope, last_read_at',
      })
      .upgrade(async (tx) => {
        const uploads = (await tx.table('upload_outbox').toArray()) as LegacyUploadItem[]
        for (const u of uploads) await tx.table('mutation_outbox').add(uploadToOp(u))
        const gps = (await tx.table('gps_outbox').toArray()) as LegacyGpsItem[]
        for (const g of gps) await tx.table('mutation_outbox').add(gpsToOp(g))
        // Rows copied — clear legacy rows to avoid double blob storage.
        // The (now-empty) legacy tables stay defined for rollback-safety.
        await tx.table('upload_outbox').clear()
        await tx.table('gps_outbox').clear()
      })
  }
}

export const offlineDB = new ClaimondoOfflineDB()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the migration integration test**

```ts
// append to src/lib/offline/db.test.ts
import Dexie from 'dexie'
import { offlineDB } from './db'

describe('v2 -> v3 migration', () => {
  it('moves upload + gps rows into mutation_outbox and clears legacy', async () => {
    // Seed a v2-shaped DB under the same name, then close it.
    const v2 = new Dexie('ClaimondoOffline')
    v2.version(1).stores({ upload_outbox: '++id, fall_id, status, created_at' })
    v2.version(2).stores({
      upload_outbox: '++id, fall_id, status, created_at, last_attempt_at, idempotency_key',
      gps_outbox: '++id, sv_id, status, captured_at, last_attempt_at, idempotency_key',
    })
    await v2.open()
    await v2.table('upload_outbox').add({
      idempotency_key: 'u1', fall_id: 'f1', dokument_typ: 'x', file_blob: new Blob(['a']),
      file_name: 'a.png', file_size: 1, content_type: 'image/png', ist_pflicht: false,
      ab_phase: null, created_at: 1, status: 'pending', retry_count: 0, last_attempt_at: null,
    })
    await v2.table('gps_outbox').add({
      idempotency_key: 'g1', sv_id: 's1', termin_id: null, lat: 1, lng: 2, accuracy_m: null,
      heading: null, speed_kmh: null, captured_at: 2, status: 'pending', retry_count: 0,
      last_attempt_at: null, created_at: 2,
    })
    v2.close()

    // Opening the real DB triggers the v3 upgrade.
    await offlineDB.open()
    const ops = await offlineDB.mutation_outbox.toArray()
    expect(ops.map((o) => o.kind).sort()).toEqual(['fall_dokument_upload', 'gps_position'])
    expect(await offlineDB.upload_outbox.count()).toBe(0)
    expect(await offlineDB.gps_outbox.count()).toBe(0)
  })
})
```

- [ ] **Step 6: Run the full db test file**

Run: `npx vitest run src/lib/offline/db.test.ts`
Expected: PASS (mappers + migration).

- [ ] **Step 7: Commit**

```bash
git add src/lib/offline/db.ts src/lib/offline/db.test.ts
git commit -m "feat(offline): Dexie v3 schema (mutation_outbox + snapshots) + v2 migration"
```

---

## Task 3: `registry.ts` — handler registry

**Files:**
- Create: `src/lib/offline/registry.ts`
- Test: `src/lib/offline/registry.test.ts`

**Interfaces:**
- Consumes: `OfflineHandler` from `./ops`.
- Produces: `registerHandler(h)`, `getHandler(kind)`, `getRegisteredKinds()`, `clearHandlers()` (test-only).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerHandler, getHandler, getRegisteredKinds, clearHandlers } from './registry'

beforeEach(() => clearHandlers())

describe('registry', () => {
  it('registers and retrieves a handler by kind', () => {
    const h = { kind: 'demo', replay: async () => ({ outcome: 'done' as const }) }
    registerHandler(h)
    expect(getHandler('demo')).toBe(h)
    expect(getRegisteredKinds()).toEqual(['demo'])
  })
  it('returns undefined for unknown kind', () => {
    expect(getHandler('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/registry.test.ts`
Expected: FAIL — "Cannot find module './registry'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/registry.ts
import type { OfflineHandler } from './ops'

const handlers = new Map<string, OfflineHandler>()

export function registerHandler(handler: OfflineHandler): void {
  handlers.set(handler.kind, handler)
}
export function getHandler(kind: string): OfflineHandler | undefined {
  return handlers.get(kind)
}
export function getRegisteredKinds(): string[] {
  return [...handlers.keys()]
}
/** Test-only: reset the registry between tests. */
export function clearHandlers(): void {
  handlers.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/registry.ts src/lib/offline/registry.test.ts
git commit -m "feat(offline): handler registry (register/get/kinds)"
```

---

## Task 4: `snapshot.ts` — snapshot store + `resolveOfflineData`

**Files:**
- Create: `src/lib/offline/snapshot.ts`
- Create: `src/lib/offline/use-offline-data.ts`
- Test: `src/lib/offline/snapshot.test.ts`

**Interfaces:**
- Consumes: `offlineDB`, `Snapshot` from `./db`.
- Produces: `saveSnapshot({key,scope,role,data})`, `readSnapshot(key)`, `touchSnapshot(key)`, `patchSnapshot(ref, fn)`, `evictLRU(cap)`, pure `resolveOfflineData({serverData?, snapshot})`, and `useOfflineData(key, {serverData?, scope, role})`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/snapshot.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { resolveOfflineData, saveSnapshot, readSnapshot, evictLRU } from './snapshot'

describe('resolveOfflineData (pure)', () => {
  it('prefers live server data', () => {
    expect(resolveOfflineData({ serverData: { a: 1 }, snapshot: null }))
      .toEqual({ data: { a: 1 }, source: 'live', staleSince: null })
  })
  it('falls back to snapshot', () => {
    const snap = { key: 'k', scope: 's', role: 'sv', data: { a: 2 }, saved_at: 50, last_read_at: 60 }
    expect(resolveOfflineData({ snapshot: snap }))
      .toEqual({ data: { a: 2 }, source: 'snapshot', staleSince: 50 })
  })
  it('empty when nothing available', () => {
    expect(resolveOfflineData({ snapshot: null }))
      .toEqual({ data: null, source: 'empty', staleSince: null })
  })
})

describe('snapshot store', () => {
  it('round-trips a snapshot', async () => {
    await saveSnapshot({ key: 'fall:1', scope: 'fall', role: 'sv', data: { x: 1 } })
    const snap = await readSnapshot('fall:1')
    expect(snap?.data).toEqual({ x: 1 })
  })
  it('evictLRU keeps only the cap newest by last_read_at', async () => {
    for (const [k, t] of [['a', 1], ['b', 2], ['c', 3]] as const) {
      await saveSnapshot({ key: `s:${k}`, scope: 's', role: 'sv', data: k, nowOverride: t })
    }
    const removed = await evictLRU(2, 's')
    expect(removed).toBe(1)
    expect(await readSnapshot('s:a')).toBeNull() // oldest gone
    expect(await readSnapshot('s:c')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/snapshot.test.ts`
Expected: FAIL — "Cannot find module './snapshot'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/snapshot.ts
'use client'
import { offlineDB, type Snapshot } from './db'

export function resolveOfflineData<T>(opts: { serverData?: T; snapshot: Snapshot | null }): {
  data: T | null
  source: 'live' | 'snapshot' | 'empty'
  staleSince: number | null
} {
  if (opts.serverData !== undefined) return { data: opts.serverData, source: 'live', staleSince: null }
  if (opts.snapshot) return { data: opts.snapshot.data as T, source: 'snapshot', staleSince: opts.snapshot.saved_at }
  return { data: null, source: 'empty', staleSince: null }
}

export async function saveSnapshot(input: {
  key: string
  scope: string
  role: string
  data: unknown
  /** test-only clock override */
  nowOverride?: number
}): Promise<void> {
  const now = input.nowOverride ?? Date.now()
  await offlineDB.snapshots.put({
    key: input.key,
    scope: input.scope,
    role: input.role,
    data: input.data,
    saved_at: now,
    last_read_at: now,
  })
}

export async function readSnapshot(key: string): Promise<Snapshot | null> {
  const snap = await offlineDB.snapshots.get(key)
  if (snap) void offlineDB.snapshots.update(key, { last_read_at: Date.now() }).catch(() => {})
  return snap ?? null
}

export async function touchSnapshot(key: string): Promise<void> {
  await offlineDB.snapshots.update(key, { last_read_at: Date.now() }).catch(() => {})
}

export async function patchSnapshot(
  ref: { scope: string; id: string },
  patch: (current: unknown) => unknown,
): Promise<void> {
  const key = `${ref.scope}:${ref.id}`
  const snap = await offlineDB.snapshots.get(key)
  if (!snap) return
  await offlineDB.snapshots.update(key, { data: patch(snap.data), saved_at: Date.now() })
}

/** Keep only the `cap` most-recently-read snapshots in a scope; delete the rest. */
export async function evictLRU(cap: number, scope?: string): Promise<number> {
  const coll = scope ? offlineDB.snapshots.where('scope').equals(scope) : offlineDB.snapshots.toCollection()
  const all = await coll.sortBy('last_read_at') // ascending: oldest first
  const excess = all.length - cap
  if (excess <= 0) return 0
  const toDelete = all.slice(0, excess).map((s) => s.key)
  await offlineDB.snapshots.bulkDelete(toDelete)
  return toDelete.length
}
```

```ts
// src/lib/offline/use-offline-data.ts
'use client'
import { useEffect, useState } from 'react'
import { resolveOfflineData, saveSnapshot, readSnapshot } from './snapshot'

/**
 * Online-SSR path: pass serverData → snapshot is persisted, source='live'.
 * Offline/navigation: omit serverData → reads snapshot, source='snapshot'|'empty'.
 * DOM behavior is covered by Playwright in later slices (no jsdom in unit env).
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
    return () => {
      cancelled = true
    }
  }, [key, opts.scope, opts.role, opts.serverData])

  return state
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/snapshot.ts src/lib/offline/use-offline-data.ts src/lib/offline/snapshot.test.ts
git commit -m "feat(offline): snapshot store + resolveOfflineData + useOfflineData hook"
```

---

## Task 5: `enqueue.ts` — enqueue + status CRUD + recovery

**Files:**
- Create: `src/lib/offline/enqueue.ts`
- Test: `src/lib/offline/enqueue.test.ts`

**Interfaces:**
- Consumes: `offlineDB` (`./db`), `OutboxOp`/`OutboxStatus`/`generateUuid`/`nextStatusAfterFailure` (`./ops`), `getHandler` (`./registry`), `patchSnapshot` (`./snapshot`).
- Produces: `enqueueOp(input)` → `{ id; idempotency_key }`; `markOp(id, status, error?)`; `removeOp(id)`; `getPendingOps()`; `getPendingCountByKind(kinds?)`; `getDeadCount()`; `resetDeadLetter(id)`; `recoverOutbox()`; `requestPersistIfPossible()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/enqueue.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { offlineDB } from './db'
import { enqueueOp, markOp, getPendingOps, getPendingCountByKind, getDeadCount, recoverOutbox } from './enqueue'
import { MAX_RETRIES } from './ops'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
})

describe('enqueueOp', () => {
  it('adds a pending op with a generated idempotency_key', async () => {
    const { id, idempotency_key } = await enqueueOp({
      kind: 'demo', replay_class: 'B', payload: { a: 1 },
    })
    expect(id).toBeGreaterThan(0)
    expect(idempotency_key).toMatch(/[0-9a-f-]{36}/)
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.status).toBe('pending')
    expect(await getPendingCountByKind(['demo'])).toBe(1)
  })
})

describe('markOp', () => {
  it('increments retry and dead-letters at MAX_RETRIES', async () => {
    const { id } = await enqueueOp({ kind: 'demo', replay_class: 'A', payload: {} })
    for (let i = 0; i < MAX_RETRIES; i++) await markOp(id, 'failed', 'boom')
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.status).toBe('dead')
    expect(await getDeadCount()).toBe(1)
  })
})

describe('recoverOutbox', () => {
  it('resets stuck uploading rows to pending', async () => {
    const { id } = await enqueueOp({ kind: 'demo', replay_class: 'A', payload: {} })
    await markOp(id, 'uploading')
    const n = await recoverOutbox()
    expect(n).toBe(1)
    expect((await getPendingOps()).length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/enqueue.test.ts`
Expected: FAIL — "Cannot find module './enqueue'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/enqueue.ts
'use client'
import { offlineDB } from './db'
import { type OutboxOp, type OutboxStatus, generateUuid, nextStatusAfterFailure } from './ops'
import { getHandler } from './registry'
import { patchSnapshot } from './snapshot'

let persistRequested = false
export async function requestPersistIfPossible(): Promise<void> {
  if (persistRequested) return
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  persistRequested = true
  try {
    await navigator.storage.persist()
  } catch {
    // best-effort
  }
}

export async function enqueueOp(input: {
  kind: string
  replay_class: OutboxOp['replay_class']
  payload: unknown
  blob?: Blob
  blob_meta?: OutboxOp['blob_meta']
  entity_ref?: OutboxOp['entity_ref']
}): Promise<{ id: number; idempotency_key: string }> {
  void requestPersistIfPossible()
  const idempotency_key = generateUuid()
  const op: OutboxOp = {
    ...input,
    idempotency_key,
    status: 'pending',
    retry_count: 0,
    last_attempt_at: null,
    created_at: Date.now(),
  }
  const id = await offlineDB.mutation_outbox.add(op)

  // Optimistic local snapshot patch so the field user sees their own input.
  const handler = getHandler(input.kind)
  if (handler?.optimisticPatch && input.entity_ref) {
    await patchSnapshot(input.entity_ref, (cur) => handler.optimisticPatch!(cur, { ...op, id })).catch(
      () => {},
    )
  }
  return { id, idempotency_key }
}

export async function markOp(id: number, status: OutboxStatus, error?: string): Promise<void> {
  const item = await offlineDB.mutation_outbox.get(id)
  if (!item) return
  const now = Date.now()
  if (status === 'failed') {
    const { status: finalStatus, retry_count } = nextStatusAfterFailure(item.retry_count)
    await offlineDB.mutation_outbox.update(id, {
      status: finalStatus,
      retry_count,
      last_error: error,
      last_attempt_at: now,
    })
    return
  }
  await offlineDB.mutation_outbox.update(id, {
    status,
    last_error: error,
    last_attempt_at: status === 'uploading' ? now : item.last_attempt_at,
  })
}

export async function removeOp(id: number): Promise<void> {
  await offlineDB.mutation_outbox.delete(id)
}

export async function getPendingOps(): Promise<OutboxOp[]> {
  return offlineDB.mutation_outbox.where('status').anyOf('pending', 'failed').sortBy('created_at')
}

export async function getPendingCountByKind(kinds?: string[]): Promise<number> {
  const rows = await offlineDB.mutation_outbox
    .where('status')
    .anyOf('pending', 'uploading', 'failed')
    .toArray()
  return kinds ? rows.filter((r) => kinds.includes(r.kind)).length : rows.length
}

export async function getDeadCount(): Promise<number> {
  return offlineDB.mutation_outbox.where('status').equals('dead').count()
}

export async function resetDeadLetter(id: number): Promise<void> {
  await offlineDB.mutation_outbox.update(id, {
    status: 'pending',
    retry_count: 0,
    last_error: undefined,
    last_attempt_at: null,
  })
}

export async function recoverOutbox(): Promise<number> {
  return offlineDB.mutation_outbox.where('status').equals('uploading').modify({ status: 'pending' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/enqueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/enqueue.ts src/lib/offline/enqueue.test.ts
git commit -m "feat(offline): generic enqueue + status CRUD + recovery on mutation_outbox"
```

---

## Task 6: `sync.ts` — generic drain (single + batch)

**Files:**
- Create: `src/lib/offline/sync.ts`
- Test: `src/lib/offline/sync.test.ts`

**Interfaces:**
- Consumes: `getPendingOps`/`markOp`/`removeOp` (`./enqueue`), `getHandler` (`./registry`), `isReadyForRetry` (`./ops`), `./handlers` (side-effect registration).
- Produces: `drainOutbox(opts?: { kinds?: string[] })` → `{ synced; failed }`; `registerOnlineSync()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/sync.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { offlineDB } from './db'
import { enqueueOp } from './enqueue'
import { registerHandler, clearHandlers } from './registry'
import { drainOutbox } from './sync'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
  clearHandlers()
})

describe('drainOutbox — single replay', () => {
  it('removes an op whose handler returns done', async () => {
    registerHandler({ kind: 'ok', replay: async () => ({ outcome: 'done' }) })
    await enqueueOp({ kind: 'ok', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res.synced).toBe(1)
    expect(await offlineDB.mutation_outbox.count()).toBe(0)
  })
  it('keeps + marks failed an op whose handler returns retry', async () => {
    registerHandler({ kind: 'bad', replay: async () => ({ outcome: 'retry', error: 'x' }) })
    const { id } = await enqueueOp({ kind: 'bad', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res.failed).toBe(1)
    expect((await offlineDB.mutation_outbox.get(id))?.status).toBe('failed')
  })
})

describe('drainOutbox — batch replay', () => {
  it('passes grouped ops to drainBatch and removes the done ids', async () => {
    const seen = vi.fn()
    registerHandler({
      kind: 'batch',
      drainBatch: async (ops) => {
        seen(ops.length)
        return { done: ops.map((o) => o.id!), failed: [] }
      },
    })
    await enqueueOp({ kind: 'batch', replay_class: 'A', payload: { n: 1 } })
    await enqueueOp({ kind: 'batch', replay_class: 'A', payload: { n: 2 } })
    const res = await drainOutbox()
    expect(seen).toHaveBeenCalledWith(2)
    expect(res.synced).toBe(2)
    expect(await offlineDB.mutation_outbox.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/sync.test.ts`
Expected: FAIL — "Cannot find module './sync'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/sync.ts
'use client'
import { getPendingOps, markOp, removeOp } from './enqueue'
import { getHandler } from './registry'
import { isReadyForRetry, type OutboxOp } from './ops'
import './handlers' // side-effect: registers built-in handlers

let syncing = false

export async function drainOutbox(opts?: { kinds?: string[] }): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 }

  syncing = true
  let synced = 0
  let failed = 0
  const now = Date.now()

  try {
    let ops = await getPendingOps()
    if (opts?.kinds) ops = ops.filter((o) => opts.kinds!.includes(o.kind))
    ops = ops.filter((o) => isReadyForRetry(o, now))

    // Group by kind so batch handlers get all their ops at once.
    const byKind = new Map<string, OutboxOp[]>()
    for (const op of ops) {
      const arr = byKind.get(op.kind) ?? []
      arr.push(op)
      byKind.set(op.kind, arr)
    }

    for (const [kind, kindOps] of byKind) {
      const handler = getHandler(kind)
      if (!handler) continue // no handler registered → skip (leave pending)

      if (handler.drainBatch) {
        for (const id of kindOps.map((o) => o.id!).filter(Boolean)) await markOp(id, 'uploading')
        const { done, failed: failedIds, error } = await handler.drainBatch(kindOps)
        for (const id of done) await removeOp(id)
        for (const id of failedIds) await markOp(id, 'failed', error ?? 'Batch fehlgeschlagen')
        synced += done.length
        failed += failedIds.length
        continue
      }

      if (handler.replay) {
        for (const op of kindOps) {
          if (!op.id) continue
          await markOp(op.id, 'uploading')
          const result = await handler.replay(op)
          if (result.outcome === 'done' || result.outcome === 'conflict') {
            await removeOp(op.id)
            synced++
          } else {
            await markOp(op.id, 'failed', result.error)
            failed++
          }
        }
      }
    }
  } finally {
    syncing = false
  }

  return { synced, failed }
}

let listenerRegistered = false
export function registerOnlineSync(): void {
  if (listenerRegistered || typeof window === 'undefined') return
  listenerRegistered = true
  window.addEventListener('online', () => {
    setTimeout(() => drainOutbox(), 1500)
  })
  if (navigator.onLine) {
    setTimeout(() => drainOutbox(), 3000)
  }
}
```

Note: `import './handlers'` will fail to resolve until Task 7 creates it. That is expected — the sync test does NOT import handlers (it registers fakes), but TypeScript/bundler needs the file to exist. Create an empty `src/lib/offline/handlers/index.ts` (`export {}`) now if the test run complains; Task 7/8 fill it.

- [ ] **Step 4: Create a placeholder handlers barrel so the import resolves**

```ts
// src/lib/offline/handlers/index.ts
// Built-in handlers self-register on import. Filled in Tasks 7 + 8.
export {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/sync.test.ts`
Expected: PASS (single done/retry + batch).

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/sync.ts src/lib/offline/handlers/index.ts src/lib/offline/sync.test.ts
git commit -m "feat(offline): generic drainOutbox (single + batch) + online-sync registration"
```

---

## Task 7: `handlers/fall-dokument-upload.ts` — Class-A upload handler

**Files:**
- Create: `src/lib/offline/handlers/fall-dokument-upload.ts`
- Modify: `src/lib/offline/handlers/index.ts`
- Test: `src/lib/offline/handlers/fall-dokument-upload.test.ts`

**Interfaces:**
- Consumes: `OutboxOp`/`ReplayResult` (`../ops`), `registerHandler` (`../registry`), `createClient` (`@/lib/supabase/client`).
- Produces: `fallDokumentUploadHandler: OfflineHandler` (kind `fall_dokument_upload`), self-registered on import.

**Ported from** `sync-outbox.ts#uploadSingleItem` (storage upload → `fall_dokumente` insert → OCR trigger → 23505 = already-synced).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/handlers/fall-dokument-upload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadMock = vi.fn()
const insertSingleMock = vi.fn()
const getUserMock = vi.fn(async () => ({ data: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    from: () => ({ insert: () => ({ select: () => ({ single: insertSingleMock }) }) }),
    auth: { getUser: getUserMock },
  }),
}))
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))

import { fallDokumentUploadHandler } from './fall-dokument-upload'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'fall_dokument_upload', idempotency_key: 'idem-1', replay_class: 'A',
  payload: { fall_id: 'f1', dokument_typ: 'schadensfoto', ist_pflicht: true, ab_phase: null },
  blob: new Blob(['x'], { type: 'image/png' }),
  blob_meta: { file_name: 'a.png', content_type: 'image/png', file_size: 1 },
  entity_ref: { scope: 'fall', id: 'f1' }, status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}

beforeEach(() => { uploadMock.mockReset(); insertSingleMock.mockReset() })

describe('fallDokumentUploadHandler', () => {
  it('done on successful upload + insert', async () => {
    uploadMock.mockResolvedValue({ error: null })
    insertSingleMock.mockResolvedValue({ data: { id: 'doc1' }, error: null })
    expect(await fallDokumentUploadHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('done on 23505 (already synced)', async () => {
    uploadMock.mockResolvedValue({ error: null })
    insertSingleMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } })
    expect(await fallDokumentUploadHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('retry on storage error', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'net' } })
    const r = await fallDokumentUploadHandler.replay!(op)
    expect(r.outcome).toBe('retry')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/handlers/fall-dokument-upload.test.ts`
Expected: FAIL — "Cannot find module './fall-dokument-upload'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/handlers/fall-dokument-upload.ts
'use client'
import { createClient } from '@/lib/supabase/client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface UploadPayload {
  fall_id: string
  dokument_typ: string
  ist_pflicht: boolean
  ab_phase: string | null
}

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as UploadPayload
  const meta = op.blob_meta
  if (!op.blob || !meta) return { outcome: 'retry', error: 'Kein Blob im Op' }
  const supabase = createClient()

  const ext = meta.file_name.split('.').pop() ?? 'bin'
  const storagePath = `${p.fall_id}/${p.dokument_typ}_${op.idempotency_key}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, op.blob, { contentType: meta.content_type, upsert: true })
  if (uploadErr) return { outcome: 'retry', error: uploadErr.message }

  const { data: user } = await supabase.auth.getUser()
  const isOcrable = meta.content_type === 'application/pdf' || meta.content_type.startsWith('image/')
  const { data: row, error: insertErr } = await supabase
    .from('fall_dokumente')
    .insert({
      idempotency_key: op.idempotency_key,
      fall_id: p.fall_id,
      dokument_typ: p.dokument_typ,
      ist_pflicht: p.ist_pflicht,
      ab_phase: p.ab_phase,
      storage_path: storagePath,
      original_filename: meta.file_name,
      mime_type: meta.content_type,
      groesse_bytes: meta.file_size,
      ocr_status: isOcrable ? 'pending' : 'skipped',
      hochgeladen_von_user_id: user?.user?.id ?? null,
    })
    .select('id')
    .single()

  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') return { outcome: 'done' } // already synced
    return { outcome: 'retry', error: insertErr.message ?? 'DB-Insert fehlgeschlagen' }
  }
  if (!row) return { outcome: 'retry', error: 'Kein Row zurückgegeben' }

  if (isOcrable) {
    fetch('/api/ocr-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dokument_id: row.id }),
    }).catch(() => {})
  }
  return { outcome: 'done' }
}

export const fallDokumentUploadHandler: OfflineHandler = { kind: 'fall_dokument_upload', replay }
registerHandler(fallDokumentUploadHandler)
```

- [ ] **Step 4: Register the handler in the barrel**

```ts
// src/lib/offline/handlers/index.ts
// Built-in handlers self-register on import.
import './fall-dokument-upload'
export {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/handlers/fall-dokument-upload.test.ts`
Expected: PASS (done / 23505-done / retry).

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/handlers/fall-dokument-upload.ts src/lib/offline/handlers/index.ts src/lib/offline/handlers/fall-dokument-upload.test.ts
git commit -m "feat(offline): fall_dokument_upload handler (Class A, ported from sync-outbox)"
```

---

## Task 8: `handlers/gps-position.ts` — batch handler

**Files:**
- Create: `src/lib/offline/handlers/gps-position.ts`
- Modify: `src/lib/offline/handlers/index.ts`
- Test: `src/lib/offline/handlers/gps-position.test.ts`

**Interfaces:**
- Consumes: `OutboxOp` (`../ops`), `registerHandler` (`../registry`).
- Produces: `gpsPositionHandler: OfflineHandler` (kind `gps_position`, uses `drainBatch`), self-registered.

**Ported from** `sync-gps-outbox.ts` (chunk of 50 → POST `/api/sv/position-batch`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline/handlers/gps-position.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gpsPositionHandler } from './gps-position'
import type { OutboxOp } from '../ops'

function op(id: number): OutboxOp {
  return {
    id, kind: 'gps_position', idempotency_key: `g${id}`, replay_class: 'A',
    payload: { sv_id: 's1', termin_id: null, lat: 1, lng: 2, accuracy_m: null, heading: null, speed_kmh: null, captured_at: id },
    status: 'pending', retry_count: 0, last_attempt_at: null, created_at: id,
  }
}

beforeEach(() => vi.restoreAllMocks())

describe('gpsPositionHandler.drainBatch', () => {
  it('posts in chunks of 50 and marks all done on ok', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    const ops = Array.from({ length: 60 }, (_, i) => op(i + 1))
    const res = await gpsPositionHandler.drainBatch!(ops)
    expect(fetchMock).toHaveBeenCalledTimes(2) // 50 + 10
    expect(res.done.length).toBe(60)
    expect(res.failed.length).toBe(0)
  })
  it('marks batch failed on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => 'err' })))
    const res = await gpsPositionHandler.drainBatch!([op(1), op(2)])
    expect(res.done.length).toBe(0)
    expect(res.failed).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/handlers/gps-position.test.ts`
Expected: FAIL — "Cannot find module './gps-position'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/offline/handlers/gps-position.ts
'use client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp } from '../ops'

const BATCH_SIZE = 50

interface GpsPayload {
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
}

async function drainBatch(ops: OutboxOp[]): Promise<{ done: number[]; failed: number[]; error?: string }> {
  const sorted = [...ops].sort((a, b) => {
    const ca = (a.payload as GpsPayload).captured_at
    const cb = (b.payload as GpsPayload).captured_at
    return ca - cb
  })
  const done: number[] = []
  const failed: number[] = []
  let error: string | undefined

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const chunk = sorted.slice(i, i + BATCH_SIZE)
    const ids = chunk.map((o) => o.id!).filter(Boolean)
    const payload = {
      positions: chunk.map((o) => {
        const p = o.payload as GpsPayload
        return {
          idempotency_key: o.idempotency_key,
          termin_id: p.termin_id,
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracy_m,
          heading: p.heading,
          speed_kmh: p.speed_kmh,
          captured_at: new Date(p.captured_at).toISOString(),
        }
      }),
    }
    try {
      const res = await fetch('/api/sv/position-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error = (await res.text().catch(() => 'Batch-Upload fehlgeschlagen')).slice(0, 500)
        failed.push(...ids)
        continue
      }
      done.push(...ids)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Netzwerk-Fehler'
      failed.push(...ids)
    }
  }
  return { done, failed, error }
}

export const gpsPositionHandler: OfflineHandler = { kind: 'gps_position', drainBatch }
registerHandler(gpsPositionHandler)
```

- [ ] **Step 4: Register the handler in the barrel**

```ts
// src/lib/offline/handlers/index.ts
// Built-in handlers self-register on import.
import './fall-dokument-upload'
import './gps-position'
export {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/offline/handlers/gps-position.test.ts`
Expected: PASS (chunking + failure).

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/handlers/gps-position.ts src/lib/offline/handlers/index.ts src/lib/offline/handlers/gps-position.test.ts
git commit -m "feat(offline): gps_position batch handler (ported from sync-gps-outbox)"
```

---

## Task 9: Back-compat shims + consumer re-wire (behavior-preserving)

**Files:**
- Rewrite: `src/lib/offline/outbox.ts`
- Rewrite: `src/lib/offline/sync-outbox.ts`
- Rewrite: `src/lib/offline/sync-gps-outbox.ts`
- Modify: `src/lib/offline/use-pending-count.ts`
- Modify: `src/components/offline/DeadLetterDialog.tsx`
- Modify: `src/lib/offline/register-sw.ts`
- Test: `src/lib/offline/outbox.compat.test.ts`

**Interfaces (must stay exported for unchanged consumers):**
- `outbox.ts`: `offlineDB`, `generateUuid`, `MAX_RETRIES`, `OutboxStatus`, `OutboxItem`, `GpsOutboxItem`, `addToOutbox`, `addGpsPosition`, `getPendingCount`, `getGpsPendingCount`, `getDeadCount`, `getOutboxItems`, `updateOutboxStatus`, `removeFromOutbox`, `resetDeadLetter`, `recoverOutbox`.
- `sync-outbox.ts`: `syncOutbox`, `registerOnlineSync`, `getBackoff`.
- `sync-gps-outbox.ts`: `syncGpsOutbox`, `registerGpsOnlineSync`, `getGpsPendingCount`.

- [ ] **Step 1: Write the failing compat test**

```ts
// src/lib/offline/outbox.compat.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { offlineDB } from './db'
import { addToOutbox, getPendingCount, getOutboxItems } from './outbox'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
})

describe('addToOutbox compat', () => {
  it('enqueues a fall_dokument_upload op and surfaces it via legacy shape', async () => {
    const { id, idempotency_key } = await addToOutbox({
      fall_id: 'f1', dokument_typ: 'schadensfoto', file_blob: new Blob(['x'], { type: 'image/png' }),
      file_name: 'a.png', file_size: 3, content_type: 'image/png', ist_pflicht: true, ab_phase: null,
    })
    expect(id).toBeGreaterThan(0)
    expect(idempotency_key).toMatch(/[0-9a-f-]{36}/)
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.kind).toBe('fall_dokument_upload')
    expect(await getPendingCount()).toBe(1)
    const items = await getOutboxItems()
    expect(items[0]).toMatchObject({ file_name: 'a.png', dokument_typ: 'schadensfoto', fall_id: 'f1', status: 'pending' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline/outbox.compat.test.ts`
Expected: FAIL — old `outbox.ts` still defines the standalone Dexie DB (its `addToOutbox` writes `upload_outbox`, so `mutation_outbox.get(id)` is empty and the assertion fails).

- [ ] **Step 3: Rewrite `outbox.ts` as delegating shim**

```ts
// src/lib/offline/outbox.ts
// Back-compat shim. The real storage is now db.ts (mutation_outbox); this file
// maps the legacy KFZ-180/AAR-388 API onto the generalized layer so existing
// consumers (FallDokumentDropzone, useFieldTracking, OutboxBadge) keep working.
'use client'
import { offlineDB } from './db'
import { enqueueOp, getPendingCountByKind, getDeadCount as getDeadCountNew, markOp, removeOp, resetDeadLetter as resetDeadLetterNew, recoverOutbox as recoverOutboxNew } from './enqueue'
import type { OutboxStatus } from './ops'
export { offlineDB } from './db'
export { generateUuid, MAX_RETRIES, type OutboxStatus } from './ops'

// Legacy shapes kept for consumers that render them (OutboxBadge/DeadLetterDialog).
export interface OutboxItem {
  id?: number
  idempotency_key: string
  fall_id: string
  dokument_typ: string
  file_name: string
  file_size: number
  content_type: string
  status: OutboxStatus
  retry_count: number
  last_error?: string
}
export interface GpsOutboxItem {
  id?: number
  idempotency_key: string
  sv_id: string
  status: OutboxStatus
}

export async function addToOutbox(item: {
  fall_id: string
  dokument_typ: string
  file_blob: Blob
  file_name: string
  file_size: number
  content_type: string
  ist_pflicht: boolean
  ab_phase: string | null
}): Promise<{ id: number; idempotency_key: string }> {
  return enqueueOp({
    kind: 'fall_dokument_upload',
    replay_class: 'A',
    payload: { fall_id: item.fall_id, dokument_typ: item.dokument_typ, ist_pflicht: item.ist_pflicht, ab_phase: item.ab_phase },
    blob: item.file_blob,
    blob_meta: { file_name: item.file_name, content_type: item.content_type, file_size: item.file_size },
    entity_ref: { scope: 'fall', id: item.fall_id },
  })
}

export async function addGpsPosition(item: {
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
}): Promise<number> {
  const { id } = await enqueueOp({ kind: 'gps_position', replay_class: 'A', payload: { ...item } })
  return id
}

export async function getPendingCount(): Promise<number> {
  return getPendingCountByKind(['fall_dokument_upload'])
}
export async function getGpsPendingCount(): Promise<number> {
  return getPendingCountByKind(['gps_position'])
}
export async function getDeadCount(): Promise<number> {
  return getDeadCountNew()
}

/** Map mutation_outbox upload ops back to the legacy OutboxItem shape for UI. */
export async function getOutboxItems(): Promise<OutboxItem[]> {
  const rows = await offlineDB.mutation_outbox.where('kind').equals('fall_dokument_upload').sortBy('created_at')
  return rows.map((op) => {
    const p = op.payload as { fall_id: string; dokument_typ: string }
    return {
      id: op.id,
      idempotency_key: op.idempotency_key,
      fall_id: p.fall_id,
      dokument_typ: p.dokument_typ,
      file_name: op.blob_meta?.file_name ?? '',
      file_size: op.blob_meta?.file_size ?? 0,
      content_type: op.blob_meta?.content_type ?? '',
      status: op.status,
      retry_count: op.retry_count,
      last_error: op.last_error,
    }
  })
}

export async function updateOutboxStatus(id: number, status: OutboxStatus, error?: string): Promise<void> {
  await markOp(id, status, error)
}
export async function removeFromOutbox(id: number): Promise<void> {
  await removeOp(id)
}
export async function resetDeadLetter(id: number): Promise<void> {
  await resetDeadLetterNew(id)
}
export async function recoverOutbox(): Promise<{ upload: number; gps: number }> {
  const n = await recoverOutboxNew()
  return { upload: n, gps: 0 } // combined recovery; split kept for signature compat
}
```

- [ ] **Step 4: Rewrite `sync-outbox.ts` + `sync-gps-outbox.ts` as delegating shims**

```ts
// src/lib/offline/sync-outbox.ts
'use client'
import { drainOutbox, registerOnlineSync } from './sync'
export { getBackoff } from './ops'
export { registerOnlineSync }
export async function syncOutbox(): Promise<{ synced: number; failed: number }> {
  return drainOutbox({ kinds: ['fall_dokument_upload'] })
}
```

```ts
// src/lib/offline/sync-gps-outbox.ts
'use client'
import { drainOutbox, registerOnlineSync } from './sync'
import { getPendingCountByKind } from './enqueue'
export async function syncGpsOutbox(): Promise<{ synced: number; failed: number }> {
  return drainOutbox({ kinds: ['gps_position'] })
}
export async function getGpsPendingCount(): Promise<number> {
  return getPendingCountByKind(['gps_position'])
}
/** Back-compat: the generalized online-sync drains ALL kinds, incl. GPS. */
export function registerGpsOnlineSync(): void {
  registerOnlineSync()
}
```

- [ ] **Step 5: Update the 2 direct-table-access consumers**

In `src/lib/offline/use-pending-count.ts`, change the import and the `useSlotPending` query. Replace the top import block:

```ts
// src/lib/offline/use-pending-count.ts  (top)
import { useEffect, useState } from 'react'
import { getDeadCount, getPendingCount, getGpsPendingCount } from './outbox'
import { offlineDB } from './db'
import type { OutboxStatus } from './ops'
```

Replace the body of `useSlotPending`'s `poll` query (was `offlineDB.upload_outbox.where('idempotency_key')`):

```ts
        const item = await offlineDB.mutation_outbox
          .where('idempotency_key')
          .equals(idempotencyKey)
          .first()
```

And change `usePendingCount`'s `poll` to use the exported helpers (it already imports `getGpsPendingCount` from `./sync-gps-outbox`; keep or switch to `./outbox` — both delegate). No other change.

In `src/components/offline/DeadLetterDialog.tsx`, replace the dead-list query and the item field access. Change the import line 8:

```ts
import { removeFromOutbox, resetDeadLetter, getOutboxItems, type OutboxItem } from '@/lib/offline/outbox'
import { offlineDB } from '@/lib/offline/db'
```

Replace the `load` function body (was `offlineDB.upload_outbox.where('status').equals('dead')`):

```ts
    const load = async () => {
      const rows = await getOutboxItems()
      if (!cancelled) setItems(rows.filter((r) => r.status === 'dead'))
    }
```

`item.file_name`, `item.fall_id`, `item.dokument_typ`, `item.retry_count`, `item.last_error` all exist on the compat `OutboxItem` → JSX unchanged.

- [ ] **Step 6: Re-wire `register-sw.ts` to the generic drain**

Replace lines 14-15 and the message handler (lines 28-34):

```ts
// src/lib/offline/register-sw.ts  (imports)
import { drainOutbox } from './sync'
```

```ts
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = (event as MessageEvent).data as { type?: string } | null
      if (data?.type === 'OUTBOX_SYNC') {
        void drainOutbox().catch(() => {})
      }
    })
```

- [ ] **Step 7: Run compat + full offline test suite**

Run: `npx vitest run src/lib/offline`
Expected: PASS (ops, db, registry, snapshot, enqueue, sync, both handlers, compat).

- [ ] **Step 8: Typecheck the whole app (catches consumer breakage)**

Run: `npx tsc --noEmit`
Expected: 0 errors. If a consumer references a removed export, fix the shim to keep it.

- [ ] **Step 9: Commit**

```bash
git add src/lib/offline/outbox.ts src/lib/offline/sync-outbox.ts src/lib/offline/sync-gps-outbox.ts src/lib/offline/use-pending-count.ts src/components/offline/DeadLetterDialog.tsx src/lib/offline/register-sw.ts src/lib/offline/outbox.compat.test.ts
git commit -m "refactor(offline): delegate legacy outbox/sync API to generalized layer (behavior-preserving)"
```

---

## Task 10: Verification — no stray table refs, build green, ratchets, behavior-preserving

**Files:** none (verification + final commit).

- [ ] **Step 1: Confirm no code outside `db.ts` touches the legacy tables**

Run (PowerShell): `Select-String -Path (Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx).FullName -Pattern 'upload_outbox|gps_outbox' | Select-Object Path,LineNumber,Line`
Expected: matches ONLY in `src/lib/offline/db.ts` (schema + migration) and test files. If any live consumer still queries these tables directly, migrate it to `mutation_outbox` (or a shim helper) and re-run.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: PASS, with the pre-existing count from P3 PLUS the new offline tests. No regressions.

- [ ] **Step 3: Full build (routes/layouts validated by Next 16)**

Run: `npm run build`
Expected: build SUCCEEDS. (FallDokumentDropzone / feldmodus client components must still compile + prerender.)

- [ ] **Step 4: Dead-code + component-set + token-audit ratchets**

Run: `npm run check:knip -- --ratchet`
Expected: no NEW unused files/deps. If `fake-indexeddb` is reported unused (it is a test-only devDep imported by `*.test.ts`), add it to `WHITELISTED_DEPS` in `scripts/check-knip.mjs` with reason `// test-only: fake-indexeddb powers Dexie unit tests (src/lib/offline/*.test.ts)`.

Run: `npm run check:component-set` and `npm run check:token-audit`
Expected: exit 0 (no new component/token violations — this slice adds no hand-rolled buttons/cards/colors).

- [ ] **Step 5: Behavior-preserving manual reasoning checklist**

Confirm each holds (write it into the commit body):
- `addToOutbox` still returns `{ id, idempotency_key }`; offline document upload path in `FallDokumentDropzone` unchanged.
- `addGpsPosition` still returns a numeric id; `useFieldTracking` unchanged.
- `syncOutbox` / `syncGpsOutbox` / `registerOnlineSync` / `registerGpsOnlineSync` / `recoverOutbox` still exported with same signatures.
- `OutboxBadge` renders queue items (via `getOutboxItems`); `DeadLetterDialog` shows dead items (via `getOutboxItems().filter(dead)`); `OfflineStatusBanner` counts via `usePendingCount`.
- 23505 → `{ outcome: 'done' }` → op removed (no duplicate). Exponential backoff unchanged (`BACKOFF_MS`, `MAX_RETRIES`).

- [ ] **Step 6: Final commit (with 7-point audit stanza)**

```bash
git add -A
git commit -m "chore(offline): Slice 0 verification (build+tests green, ratchets, behavior-preserving)

Audit:
- Build: green (npm run build + tsc --noEmit + npm test)
- UI: n/a (no new user surface; existing feldmodus UI unchanged, verified compiles)
- Redundanz: consolidated duplicated backoff/dead-letter into ops.ts; 2 write paths now registry handlers
- Dead-Code: no stray upload_outbox/gps_outbox refs outside db.ts (verified)
- Spec: implements Slice 0 of docs/superpowers/specs/2026-07-13-offline-first-field-cache-design.md
- Inkonsistenz: no new tokens/status-maps; knip fake-indexeddb whitelisted if flagged
- Regression: behavior-preserving checklist confirmed; offline upload + GPS identical
"
```

- [ ] **Step 7: Push + open PR against `staging`**

```bash
git push -u origin kitta/offline-first-field-cache
```
Then open a PR against `staging` (Regel 1). Title: `feat(offline): Slice 0 — generalized offline-first data layer (foundation)`.

---

## Self-Review (completed by plan author)

**1. Spec coverage (against `2026-07-13-offline-first-field-cache-design.md`):**
- §3 architecture (db/ops/registry/enqueue/snapshot/sync/handlers) → Tasks 1-8 ✓
- §3.1 core types (`OutboxOp`, `OfflineHandler`, `Snapshot`, `useOfflineData`) → Tasks 1, 2, 4 ✓
- §5 replay classes → encoded in `ReplayClass` + `ReplayResult` (`done`/`retry`/`conflict`); handlers assign class (A for both built-ins) ✓
- §7 view-through snapshots → `snapshot.ts` + `useOfflineData` (store built now; first consumer in Slice 1) ✓
- §8 UX reuse → shims keep `OutboxBadge`/`DeadLetterDialog`/`OfflineStatusBanner` working ✓
- §11 Slice 0 = foundation, behavior-preserving → Tasks 9-10 ✓
- §12.2 migration keeps legacy tables (not dropped) → db.ts v3 clears rows, keeps tables ✓
- Scope note: `useOfflineData` hook ships now but its first real consumer + Playwright coverage is Slice 1 (no jsdom here) — deliberate, flagged.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. The `handlers/index.ts` empty barrel in Task 6 is a real intermediate file, filled in Tasks 7-8.

**3. Type consistency:** `OutboxOp`/`OutboxStatus`/`ReplayResult`/`OfflineHandler` defined in Task 1 and used verbatim in Tasks 2-9. `drainBatch` returns `{ done; failed; error? }` in Task 1's interface, Task 6's consumer, and Task 8's implementation — consistent. `getPendingCountByKind` (Task 5) is the name used by shims in Task 9. `saveSnapshot` accepts `nowOverride` (Task 4) used by its own test only.

No gaps found.
