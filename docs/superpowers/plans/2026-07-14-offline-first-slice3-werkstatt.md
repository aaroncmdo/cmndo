# Offline-First Slice 3 — Werkstatt Intake-Edit Offline-Capture

> **For agentic workers:** executing inline (executing-plans), TDD, frequent commits. Stacked auf Slice 2-write-3 `kitta/offline-first-slice2-write3`.

**Goal:** Die Werkstatt kann ihre offene-Anfrage-Bearbeitung (`bearbeiteWerkstattLead` — Kunde/Fahrzeug/Schaden/Unfall/Gegner-Felder) **offline erfassen**; die Outbox replayed sie beim Reconnect. Die beiden Signatur-Start-Aktionen (online-only) bekommen einen klaren Offline-Guard.

**Architecture:** Handler = dünner Replay der `'use server'`-Action `bearbeiteWerkstattLead(leadId, patch)` (whitelisted LWW-Feld-Set auf dem Lead → **Class B**, wie write-1). Auth/Ownership (`requirePortalAccess`+`v_werkstatt_lead`) greift beim Replay (Werkstatt weiter eingeloggt, eigener Lead). Call-Site = `WerkstattAnfragen.speichern()` (Submit-Button, `form`=Record<string,string>).

**Tech Stack:** bestehende offline-lib; `src/app/werkstatt/(shell)/anfragen/actions.ts`; `src/components/werkstatt/WerkstattAnfragen.tsx`.

## Global Constraints
- **Class B** (idempotenter Feld-Set): Replay 2× = gleiches LWW-Update = idempotent. Netzwerk-Wurf → `retry`; server `{ok:false}` (Lead konvertiert / kein Zugriff / Werkstatt ausgeloggt = nicht-transient) → `conflict`.
- **Kind disjunkt:** `werkstatt_lead_edit`.
- **Enqueue-Entscheidung** `navigator.onLine` (instant). Offline: **kein `router.refresh()`** (RSC-Refetch würde offline hängen) — nur optimistisch schließen + Toast.
- **Signatur-Start online-only:** `starteUnterschriftAmGeraet`/`sendeUnterschriftLink` brauchen frischen Token + Send → offline klarer Toast statt verwirrendem Fehler.
- **Umlaute** echt (ä/ö/ü/ß). Kein DDL.

---

## Task 1: Handler `werkstatt_lead_edit` (Class B) + Test + Registrierung

**Files:** Create `src/lib/offline/handlers/werkstatt-lead-edit.ts` + `.test.ts`; Modify `handlers/index.ts`.

- [ ] **Step 1: Handler** `werkstatt-lead-edit.ts`:
```ts
'use client'
import { bearbeiteWerkstattLead } from '@/app/werkstatt/(shell)/anfragen/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface WerkstattLeadEditPayload { leadId: string; patch: Record<string, string | null> }

// Whitelisted LWW-Feld-Set auf dem Werkstatt-Lead (Class B). Netzwerk-Wurf -> retry;
// server {ok:false} (Lead konvertiert / kein Zugriff = nicht-transient) -> conflict (droppen).
async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as WerkstattLeadEditPayload
  try {
    const res = await bearbeiteWerkstattLead(p.leadId, p.patch)
    return res.ok ? { outcome: 'done' } : { outcome: 'conflict', error: res.error ?? 'Werkstatt-Anfrage-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

export const werkstattLeadEditHandler: OfflineHandler = { kind: 'werkstatt_lead_edit', replay }
registerHandler(werkstattLeadEditHandler)
```

- [ ] **Step 2: Test** `werkstatt-lead-edit.test.ts` (`vi.hoisted`+`vi.mock` der Action), done/conflict/retry:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const editMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/werkstatt/(shell)/anfragen/actions', () => ({ bearbeiteWerkstattLead: editMock }))
import { werkstattLeadEditHandler } from './werkstatt-lead-edit'
import type { OutboxOp } from '../ops'

const base = { id: 1, idempotency_key: 'k', status: 'pending' as const, retry_count: 0, last_attempt_at: null, created_at: 1, replay_class: 'B' as const }
const op: OutboxOp = { ...base, kind: 'werkstatt_lead_edit', payload: { leadId: 'l1', patch: { vorname: 'A', kennzeichen: 'B-X 1' } } }
beforeEach(() => editMock.mockReset())

describe('werkstattLeadEditHandler', () => {
  it('ok -> done, ruft bearbeiteWerkstattLead(leadId,patch)', async () => {
    editMock.mockResolvedValue({ ok: true })
    expect(await werkstattLeadEditHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(editMock).toHaveBeenCalledWith('l1', { vorname: 'A', kennzeichen: 'B-X 1' })
  })
  it('server {ok:false} (kein Zugriff/konvertiert) -> conflict', async () => {
    editMock.mockResolvedValue({ ok: false, error: 'Kein Zugriff' })
    expect((await werkstattLeadEditHandler.replay!(op)).outcome).toBe('conflict')
  })
  it('Netzwerk-Wurf -> retry', async () => {
    editMock.mockRejectedValue(new Error('net'))
    expect((await werkstattLeadEditHandler.replay!(op)).outcome).toBe('retry')
  })
})
```

- [ ] **Step 3: Register** — `import './werkstatt-lead-edit'` nach `import './flow-doc-uploads'` in `handlers/index.ts`.
- [ ] **Step 4:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): werkstatt lead-edit handler (Class B)`.

---

## Task 2: Offline-Zweige in WerkstattAnfragen

**Files:** Modify `src/components/werkstatt/WerkstattAnfragen.tsx`.

- [ ] **Step 1: Import** `import { enqueueOp } from '@/lib/offline/enqueue'`.

- [ ] **Step 2: `speichern()` Offline-Zweig** (vor `setSaving(true)`):
```ts
async function speichern() {
  if (!editLead) return
  // Slice 3: offline -> Outbox (class B), optimistisch schließen. KEIN router.refresh
  // (RSC-Refetch hängt offline); die Liste zieht beim Reconnect+Refresh nach.
  if (!navigator.onLine) {
    void enqueueOp({ kind: 'werkstatt_lead_edit', replay_class: 'B', payload: { leadId: editLead.id, patch: form }, entity_ref: { scope: 'lead', id: editLead.id } }).catch(() => {})
    toast.success('Offline gespeichert — wird synchronisiert, sobald Sie wieder online sind.')
    setEditLead(null)
    return
  }
  setSaving(true)
  const r = await bearbeiteWerkstattLead(editLead.id, form)
  ...
}
```

- [ ] **Step 3: Online-only-Guards** auf die Signatur-Start-Handler (vor der Server-Action):
```ts
async function handleGeraet(lead: WerkstattLead) {
  if (!navigator.onLine) { toast.error('Die Unterschrift am Gerät benötigt eine Internetverbindung.'); return }
  setBusy(`${lead.id}:geraet`)
  ...
}
async function handleLink(lead: WerkstattLead) {
  if (!navigator.onLine) { toast.error('Der Link-Versand benötigt eine Internetverbindung.'); return }
  setBusy(`${lead.id}:link`)
  ...
}
```

- [ ] **Step 4:** `npx vitest run src/lib/offline` grün. Commit `feat(offline): offline-capture werkstatt intake-edit + online-only guards for signature start`.

---

## Task 3: Verifikation + PR

- [ ] **Step 1:** `npx vitest run src/lib/offline` grün (inkl. neuer Handler).
- [ ] **Step 2: Scoped tsc** (temp `tsconfig.s3-check.json`: `src/lib/offline/**` + `src/app/werkstatt/**` + `src/components/werkstatt/**`) → 0; delete.
- [ ] **Step 3: 4 Ratchets** → 0 neu (keine neue UI-Komponente; Toast-Strings; kein Hex/Button/Status-Map).
- [ ] **Step 4: Full-Regression** `npm test` — gegen bekannten basis-inhärenten + Flaky-unter-Last-Satz (0 Regression: Diff hat keinen Import-Pfad zu einem Fail; `werkstatt/anfragen/__tests__/actions.test.ts` unberührt).
- [ ] **Step 5: Commit-Body-Reasoning:** online-Pfad unverändert (Gabel auf `!navigator.onLine`); offline kein router.refresh (RSC-Refetch-Hang vermieden); Signatur-Start online-only (Guard).
- [ ] **Step 6: Push + PR** stacked auf write-3:
```bash
git push -u origin kitta/offline-first-slice3-werkstatt
gh pr create --base kitta/offline-first-slice2-write3 --title "feat(offline): Slice 3 - Werkstatt intake-edit offline capture" --body-file <body>
```

## Self-Review
- **Spec coverage:** Werkstatt-Intake-Edit offline (Class B, Task 1+2) + online-only Signatur-Start-Guards. Signatur selbst schon via write-3 gefenced (SaSignaturStep-Guard). ✓
- **Type-Konsistenz:** kind `werkstatt_lead_edit` + payload `{leadId,patch}` konsistent Handler↔Test↔Call-Site; `bearbeiteWerkstattLead` returnt `{ok,error?}`.
- **Risk:** offline geladene /werkstatt-Seite nötig (kein SW-Read-Cache für /werkstatt — analog Flow vor Slice 2-read; realistisch: Seite online geladen → Funkloch → edit → reconnect). Read-Caching = separater Follow-up. Dokumentiert.
