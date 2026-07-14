# Offline-First Slice 2-write-2 — Kunde Foto-Uploads (ZB1 / Polizeibericht / Zeugenaussage)

> **For agentic workers:** executing inline (executing-plans), TDD, frequent commits. Stacked on Slice 2-write-1 branch `kitta/offline-first-slice2-write`.

**Goal:** Der Kunde kann die 3 Flow-Foto-Uploads offline erfassen; die Outbox replayed sie beim Reconnect.

**Architecture:** Handler = dünner Replay der bestehenden `'use server'`-Action (wie write-1). base64 wird im Client schon VOR der online/offline-Gabel berechnet (`fileToBase64` im jeweiligen `handleFile`) → wandert in `payload:{token, base64, contentType}`. Kein Blob, kein direkter Storage-Upload im Handler.

**Tech Stack:** Dexie/IndexedDB Outbox (`enqueueOp` unterstützt große Payloads + `navigator.storage.persist()`), bestehende Server-Actions `uploadZb1Flow`/`uploadPolizeiberichtFlow`/`uploadZeugenaussageFlow` in `src/app/flow/[token]/self-service-actions.ts` (`'use server'`).

## Global Constraints
- **Replay-Klasse B** (idempotenter Feld-Set): alle 3 Actions setzen LWW-Lead-Felder (`<typ>_url/_status/_hochgeladen_am`) auf `Date.now()`-Pfad. Doppel-Replay = benigne Duplikat-Storage-Datei (Lead-Feld LWW → sichtbarer Zustand konsistent). Netzwerk-Wurf → `retry`; Server-`{ok:false}` (Token ungültig) → `conflict` (droppen).
- **Kinds disjunkt:** `flow_zb1_upload`, `flow_polizeibericht_upload`, `flow_zeugenaussage_upload` (nicht in Slice 0/1/write-1).
- **Umlaute:** UI-Strings echt (ä/ö/ü/ß). Offline-Copy inline (Präzedenz TerminOfflineHinweis), kein i18n-File-Edit.
- **Enqueue-Entscheidung** `navigator.onLine` (instant), nicht `useOnlineStatus()`.

---

## Task 1: 3 Doc-Upload-Handler (Class B) + Test + Registrierung

**Files:** Create `src/lib/offline/handlers/flow-doc-uploads.ts` + `.test.ts`; Modify `src/lib/offline/handlers/index.ts`.

- [ ] **Step 1: Handler-File** `flow-doc-uploads.ts`:
```ts
'use client'
import { uploadZb1Flow, uploadPolizeiberichtFlow, uploadZeugenaussageFlow } from '@/app/flow/[token]/self-service-actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface DocUploadPayload { token: string; base64: string; contentType: string }

// Alle 3 Flow-Uploads setzen LWW-Lead-Felder (Class B). Netzwerk-Wurf -> retry (Backoff);
// server {ok:false} (Token abgelaufen/ungültig = nicht-transient) -> conflict (droppen).
// Doppel-Replay = benigne Duplikat-Storage-Datei (Date.now-Pfad), Lead-Feld LWW-konsistent.
async function replayVia(
  action: (token: string, base64: string, contentType: string) => Promise<{ ok: boolean; error?: string }>,
  op: OutboxOp,
  label: string,
): Promise<ReplayResult> {
  const p = op.payload as DocUploadPayload
  try {
    const res = await action(p.token, p.base64, p.contentType)
    return res.ok ? { outcome: 'done' } : { outcome: 'conflict', error: res.error ?? `${label}-Sync verworfen` }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

export const flowZb1UploadHandler: OfflineHandler = {
  kind: 'flow_zb1_upload',
  replay: (op) => replayVia(uploadZb1Flow, op, 'ZB1'),
}
export const flowPolizeiberichtUploadHandler: OfflineHandler = {
  kind: 'flow_polizeibericht_upload',
  replay: (op) => replayVia(uploadPolizeiberichtFlow, op, 'Polizeibericht'),
}
export const flowZeugenaussageUploadHandler: OfflineHandler = {
  kind: 'flow_zeugenaussage_upload',
  replay: (op) => replayVia(uploadZeugenaussageFlow, op, 'Zeugenaussage'),
}
registerHandler(flowZb1UploadHandler)
registerHandler(flowPolizeiberichtUploadHandler)
registerHandler(flowZeugenaussageUploadHandler)
```
Note: `uploadZb1Flow` gibt zusätzlich `extracted?` zurück — der Replay ignoriert es bewusst (die Live-Prefill-UX ist offline nicht rekonstruierbar; der Server füllt via H6 die leeren Lead-Felder). Return-Typ ist strukturell `{ok, error?}`-kompatibel.

- [ ] **Step 2: Test** `flow-doc-uploads.test.ts` (`vi.hoisted` + `vi.mock` der Actions), pro Handler done/conflict/retry:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const zb1Mock = vi.hoisted(() => vi.fn())
const poliMock = vi.hoisted(() => vi.fn())
const zeugeMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/flow/[token]/self-service-actions', () => ({
  uploadZb1Flow: zb1Mock,
  uploadPolizeiberichtFlow: poliMock,
  uploadZeugenaussageFlow: zeugeMock,
}))
import {
  flowZb1UploadHandler,
  flowPolizeiberichtUploadHandler,
  flowZeugenaussageUploadHandler,
} from './flow-doc-uploads'
import type { OutboxOp } from '../ops'

const base = { id: 1, idempotency_key: 'k', status: 'pending' as const, retry_count: 0, last_attempt_at: null, created_at: 1, replay_class: 'B' as const }
const op = (kind: string): OutboxOp => ({ ...base, kind, payload: { token: 't', base64: 'AAAA', contentType: 'image/jpeg' } })
beforeEach(() => { zb1Mock.mockReset(); poliMock.mockReset(); zeugeMock.mockReset() })

describe('flow doc-upload handlers', () => {
  it('zb1: ok -> done, ruft uploadZb1Flow(token,base64,contentType)', async () => {
    zb1Mock.mockResolvedValue({ ok: true, extracted: { kennzeichen: 'B-X 1' } })
    expect(await flowZb1UploadHandler.replay!(op('flow_zb1_upload'))).toEqual({ outcome: 'done' })
    expect(zb1Mock).toHaveBeenCalledWith('t', 'AAAA', 'image/jpeg')
  })
  it('polizeibericht: server {ok:false} -> conflict', async () => {
    poliMock.mockResolvedValue({ ok: false, error: 'Link ungültig' })
    expect((await flowPolizeiberichtUploadHandler.replay!(op('flow_polizeibericht_upload'))).outcome).toBe('conflict')
  })
  it('zeugenaussage: Netzwerk-Wurf -> retry', async () => {
    zeugeMock.mockRejectedValue(new Error('net'))
    expect((await flowZeugenaussageUploadHandler.replay!(op('flow_zeugenaussage_upload'))).outcome).toBe('retry')
  })
})
```

- [ ] **Step 3: Register** in `handlers/index.ts` — Zeile `import './flow-doc-uploads'` nach `import './flow-field-sets'`.
- [ ] **Step 4:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): flow doc-upload handlers (zb1/polizeibericht/zeugenaussage, Class B)`.

---

## Task 2: Offline-Zweige an den 3 Upload-Call-Sites

**Files:** Modify `FlowPolizeiberichtUpload.tsx`, `FlowZeugenaussageUpload.tsx`, `FlowZb1Upload.tsx`.

Muster pro `handleFile` (base64 ist schon berechnet, dann Gabel VOR der online-Action):

- [ ] **Step 1: FlowPolizeiberichtUpload.tsx** — nach dem `if (!base64) {...}`-Block, vor `uploadPolizeiberichtFlow`:
```ts
if (!navigator.onLine) {
  void enqueueOp({ kind: 'flow_polizeibericht_upload', replay_class: 'B', payload: { token, base64, contentType: file.type || 'image/jpeg' } }).catch(() => {})
  setStatus('bestaetigt')
  return
}
```
Import: `import { enqueueOp } from '@/lib/offline/enqueue'`.

- [ ] **Step 2: FlowZeugenaussageUpload.tsx** — identisch, `kind: 'flow_zeugenaussage_upload'`. Import enqueueOp.

- [ ] **Step 3: FlowZb1Upload.tsx** — neuer Status `'gespeichert'` in die Union + Offline-Gabel + Render-Branch:
  - Union: `'idle' | 'laden' | 'fertig' | 'bestaetigt' | 'fehler' | 'skip' | 'gespeichert'`.
  - In `handleFile`, nach `if (!base64) {...}`, vor `uploadZb1Flow`:
```ts
if (!navigator.onLine) {
  void enqueueOp({ kind: 'flow_zb1_upload', replay_class: 'B', payload: { token, base64, contentType: file.type || 'image/jpeg' } }).catch(() => {})
  setStatus('gespeichert')
  return
}
```
  - Render-Branch (vor dem `status === 'fertig'`-Zweig, analoge Box, inline-Umlaut-Copy):
```tsx
) : status === 'gespeichert' ? (
  <div className="rounded-ios-sm bg-success-soft border border-success/30 p-3 text-sm text-success-strong" data-testid="flow-zb1-gespeichert">
    <p className="font-medium">Foto gespeichert ✓</p>
    <p className="text-xs mt-1">Es wird automatisch ausgelesen, sobald Sie wieder online sind.</p>
  </div>
```
  - Import enqueueOp.

- [ ] **Step 4:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): offline-enqueue at flow doc-upload call-sites (zb1 graceful offline-capture)`.

---

## Task 3: Verifikation + PR

- [ ] **Step 1: Offline-Suite** `npx vitest run src/lib/offline` grün (inkl. 3 neue Handler).
- [ ] **Step 2: Scoped tsc** (temp `tsconfig.w2-check.json`, extends, include `src/lib/offline/**` + `src/app/flow/**`) → 0; delete temp.
- [ ] **Step 3: 4 Ratchets** (knip/token-audit/component-set/status-registry `--ratchet`) → 0 neu.
- [ ] **Step 4: Full-Regression** `npm test` — Fails gegen bekannten basis-inhärenten Satz gegenprüfen (byte-identische Files → 0 Regression).
- [ ] **Step 5: Commit-Body-Reasoning:** online-Pfad unverändert (Gabel auf `!navigator.onLine`); ZB1 offline = Capture-ohne-Live-OCR (Doc + Server-OCR beim Replay erhalten, nur Prefill degradiert); Duplikat-Storage-Datei bei Doppel-Replay benigne + dokumentiert.
- [ ] **Step 6: Push + PR** stacked auf write-1:
```bash
git push -u origin kitta/offline-first-slice2-write2
gh pr create --base kitta/offline-first-slice2-write --title "feat(offline): Slice 2-write-2 - Kunde Foto-Upload offline capture" --body-file <body>
```

## Self-Review
- **Spec coverage:** 3 Handler (Task 1) + 3 Call-Sites (Task 2); Polizeibericht/Zeugenaussage clean, ZB1 graceful-capture (Option C). ✓
- **Type-Konsistenz:** kinds/payload `{token,base64,contentType}` konsistent Handler↔Test↔Call-Site; alle Actions `{ok,error?}` (zb1 zusätzlich `extracted?`, strukturell kompatibel, ignoriert). ✓
- **Risk:** ZB1-Live-Prefill offline weg (bewusst, kommuniziert); Duplikat-Storage-Datei bei seltenem Doppel-Replay (benigne). Dokumentiert.
