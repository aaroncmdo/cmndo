# Offline-First Write-4 — All-Kinds Dead-Letter Surfacing UI

> **For agentic workers:** executing inline, TDD for pure/data parts. Stacked auf Slice 3 `kitta/offline-first-slice3-werkstatt`.

**Goal:** write-3 persistiert `conflict`-Ops als `dead`, aber `OutboxBadge`/`DeadLetterDialog`/`usePendingCount.dead` sind `fall_dokument_upload`-only, und /flow + /werkstatt rendern GAR keine Dead-Letter-Fläche. → Flow-/Werkstatt-Dead-Ops sind unsichtbar + nicht dismissbar (Storage-Leak). Fix: All-Kinds-Dead-Letter, kind-aware Labels, sichtbar+dismissbar auf JEDER Route via globalen `OfflineBanner` (Root-Layout).

**Architecture:** Der Barrel-Shim (`outbox.ts`) bleibt für die Foto-Semantik von `OutboxBadge` (upload-only), bekommt aber zusätzlich all-kinds Dead-Views. `usePendingCount.dead` → all-kinds. `DeadLetterDialog` rendert kind-aware. Globaler `OfflineBanner` bekommt einen persistenten Dead-Letter-Zustand (Trigger auf allen Routen).

## Global Constraints
- **Additiv, keine Verhaltensänderung** an den bestehenden Banner-States (offline/syncing/done/failed) + an `OutboxBadge` (bleibt Foto-`getPendingCount`/`getOutboxItems`).
- **Umlaute** echt. Kind-Labels user-sichtbar (DE).
- Kein DDL, kein Handler.

---

## Task 1: Kind-Labels (pure) + all-kinds Dead-View im Shim

**Files:** Create `src/lib/offline/kind-labels.ts` + `.test.ts`; Modify `src/lib/offline/outbox.ts`.

- [ ] **Step 1: `kind-labels.ts`** (pure, kein 'use client'):
```ts
const LABELS: Record<string, string> = {
  fall_dokument_upload: 'Dokument-Upload',
  gps_position: 'GPS-Position',
  flow_stammdaten: 'Kontaktdaten',
  flow_feststellung: 'Schaden-Angaben',
  flow_zb1_upload: 'Fahrzeugschein-Foto',
  flow_polizeibericht_upload: 'Polizeibericht',
  flow_zeugenaussage_upload: 'Zeugenaussage',
  werkstatt_lead_edit: 'Werkstatt-Anfrage',
}
export function offlineKindLabel(kind: string): string {
  return LABELS[kind] ?? 'Offline-Eintrag'
}
```

- [ ] **Step 2: Test** `kind-labels.test.ts`: known kind → label; unknown → 'Offline-Eintrag'.

- [ ] **Step 3: `outbox.ts`** — `DeadLetterView` + `getDeadItemsAll()` (all-kinds), nach `getOutboxItems`:
```ts
export interface DeadLetterView {
  id?: number
  kind: string
  label: string
  detail: string
  retry_count: number
  last_error?: string
}
/** All-kinds dead ops für das generalisierte DeadLetterDialog (write-4). */
export async function getDeadItemsAll(): Promise<DeadLetterView[]> {
  const { offlineKindLabel } = await import('./kind-labels')
  const rows = await offlineDB.mutation_outbox.where('status').equals('dead').sortBy('created_at')
  return rows.map((op) => ({
    id: op.id,
    kind: op.kind,
    label: offlineKindLabel(op.kind),
    detail: op.blob_meta?.file_name ?? '',
    retry_count: op.retry_count,
    last_error: op.last_error,
  }))
}
export { getDeadCount as getDeadCountAll } from './enqueue'
```
(Import `offlineKindLabel` statisch am File-Kopf statt dynamisch ist auch ok — `kind-labels` ist pure, kein server-only. Static bevorzugt.)

- [ ] **Step 4:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): kind-labels + all-kinds dead-letter view`.

---

## Task 2: usePendingCount.dead → all-kinds; DeadLetterDialog kind-aware

**Files:** Modify `src/lib/offline/use-pending-count.ts` + `src/components/offline/DeadLetterDialog.tsx`.

- [ ] **Step 1: `use-pending-count.ts`** — `dead` all-kinds. Import `getDeadCountAll` statt `getDeadCount`:
```ts
import { getPendingCount, getGpsPendingCount, getDeadCountAll } from './outbox'
// ...
const [uploadPending, gpsPending, dead] = await Promise.all([
  getPendingCount(),
  getGpsPendingCount(),
  getDeadCountAll(),
])
```

- [ ] **Step 2: `DeadLetterDialog.tsx`** — all-kinds View + all-kinds retry/dismiss:
  - Imports: `getDeadItemsAll, removeFromOutbox, resetDeadLetter, type DeadLetterView` from `@/lib/offline/outbox`; `drainOutbox` from `@/lib/offline/sync` (statt `syncOutbox`).
  - `items: DeadLetterView[]`; load via `getDeadItemsAll()` (kein `.filter(status==='dead')` mehr — schon dead-gefiltert).
  - `handleRetry`: `await resetDeadLetter(id); await drainOutbox()`.
  - Render pro item: `item.label` (statt file_name) + `item.detail` (falls vorhanden) + `item.retry_count` + `item.last_error`. KEIN `item.fall_id`/`dokument_typ` mehr (crash-safe für Nicht-Uploads).

- [ ] **Step 3:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): all-kinds dead-letter dialog + pending count`.

---

## Task 3: Globaler OfflineBanner — persistenter Dead-Letter-Zustand (alle Routen)

**Files:** Modify `src/components/offline/OfflineBanner.tsx`.

- [ ] **Step 1:** `usePendingCount()` (oder direkt `getDeadCountAll`) im Banner pollen; State `dialogOpen`. Neuer Zweig VOR dem `null`-Return (aber nach offline/syncing): wenn online & nicht mitten im Sync & `dead > 0` → persistenter Danger-Bar „N Einträge konnten nicht synchronisiert werden [Details]" → öffnet `DeadLetterDialog`. Import `DeadLetterDialog` + `usePendingCount`.
  - Reihenfolge: offline-Banner (bestehend) hat Vorrang; reconnect-syncing/done/failed (bestehend, transient); dann Dead-Letter (persistent); sonst `null`.
  - Danger-Bar nutzt `bg-danger` (Token, kein Hex), gleicher Stil wie die bestehenden Banner-Bars.

- [ ] **Step 2:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): surface dead-letters globally in OfflineBanner (flow + werkstatt + all routes)`.

---

## Task 4: Verifikation + PR

- [ ] Offline-Suite grün (inkl. kind-labels + getDeadItemsAll Tests).
- [ ] Scoped tsc (offline-lib + `src/components/offline/**`) → 0.
- [ ] 4 Ratchets → 0 neu (Danger-Bar nutzt Tokens; kein Hex/Button/Status-Map).
- [ ] Full-Regression → 0 Regression (Diff-Beweis + isolierte Checks).
- [ ] Push + PR stacked auf slice-3 (`--base kitta/offline-first-slice3-werkstatt`).

## Self-Review
- **Spec:** all-kinds Dead-Letter sichtbar (global) + dismissbar (Dialog kind-aware) → schließt write-3s Loop (Flow/Werkstatt-Dead-Ops nicht mehr unsichtbar/Leak). ✓
- **Risk:** globaler OfflineBanner = Root-Layout (jede Route). Änderung additiv (neuer Zustand); bestehende States unberührt. Feldmodus zeigt Dead evtl. doppelt (globaler Banner + eigener OfflineStatusBanner) — kosmetisch, beide → selber Dialog. Akzeptiert/dokumentiert.
- **Type:** `DeadLetterView` ersetzt upload-`OutboxItem` im Dialog; `getDeadCountAll` = enqueue.getDeadCount (all-kinds).
