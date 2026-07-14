# Offline-First Slice 2-write-3 — SA-Sign Account-Fence + Token-TTL-Dead-Letter

> **For agentic workers:** executing inline (executing-plans), TDD, frequent commits. Stacked auf Slice 2-write-2 `kitta/offline-first-slice2-write2`.

**Goal:** (1) Die verbindliche SA-Beauftragung (`signSAandCreateFall`) offline **graceful blocken** (online-only FENCE — kann nicht captured/replayed werden), (2) offline erfasste Ops, deren Flow-Token abgelaufen ist, nicht mehr **still verwerfen + fälschlich als „synced" zählen**, sondern als **Dead-Letter** behalten + ehrlich als `failed` melden.

**Architecture:**
- **FENCE** (analog `TerminOfflineHinweis` aus write-1): am `sa`-Step offline `SaOfflineHinweis` statt `SaSignaturStep`; zusätzlich Defense-in-Depth-Guard in `handleSignSA` (schützt auch den geteilten Werkstatt-Intake-Kontext gegen die Debounce-Race). KEIN Handler — die Fall-Erstellung ist online-only.
- **Dead-Letter** (Datenschicht): `drainOutbox` behandelt `conflict` (nicht-transient, z.B. Token abgelaufen) neu — `markOp('dead')` statt `removeOp`, `failed++` statt `synced++`. Datenschicht-Korrektheit; das All-Kinds-**Surfacing** (OutboxBadge/DeadLetterDialog/OfflineBanner sind heute `fall_dokument_upload`-only) ist die vom `outbox.ts`-Shim-Kommentar benannte **Folge-Slice** (write-4), nicht hier.

**Tech Stack:** bestehende offline-lib; `signSAandCreateFall` (`'use server'`), `SaSignaturStep.tsx`, `sync.ts`.

## Global Constraints
- **KEINE Verhaltensänderung an bestehenden Surfaces:** `syncOutbox()` (Badge/Banner) drainet nur `fall_dokument_upload`; diese Kind returnt nie `conflict` (nur done/retry) → die `conflict`-Änderung ist für Upload/GPS unsichtbar (verifiziert). Reine Korrektheits-Verbesserung für Flow-Ops (deren Auto-Sync-Result verworfen wird).
- **Umlaute** echt (ä/ö/ü/ß); Offline-Copy inline (Präzedenz TerminOfflineHinweis).
- **FENCE-Entscheidung** `!navigator.onLine` (instant) für den Guard; `isOnline` (`useOnlineStatus`) fürs Render-Gate (schon in FlowWizardKfz vorhanden aus write-1).
- Kein DDL. Kein neuer Handler.

---

## Task 1: SA-Sign Account-Fence (online-only)

**Files:** Create `src/app/flow/[token]/SaOfflineHinweis.tsx`; Modify `FlowWizardKfz.tsx` (sa-Render ~L806) + `SaSignaturStep.tsx` (handleSignSA-Guard).

- [ ] **Step 1: `SaOfflineHinweis.tsx`** (informativ, kein Button — der User wartet auf Reconnect, dann flippt `isOnline` → Sign-Form erscheint):
```tsx
'use client'

// Slice 2-write-3: Die verbindliche Beauftragung (signSAandCreateFall erstellt den Fall +
// braucht die fallId sofort für Account-Anlage/PDF) ist online-only — kein sinnvoller
// Offline-Zweig. Statt eines kaputten Sign-Versuchs offline ein Hinweis; die bisher
// offline erfassten Angaben sind in der Outbox und syncen beim Reconnect.
export default function SaOfflineHinweis() {
  return (
    <div className="rounded-ios-xl border border-warning/30 bg-warning-soft p-4 text-center space-y-2">
      <p className="text-body-sm font-medium text-warning-strong">Beauftragung benötigt Internet</p>
      <p className="text-body-xs text-warning-strong">
        Der letzte Schritt — die verbindliche Beauftragung — benötigt eine Internetverbindung.
        Ihre bisherigen Angaben sind gespeichert und werden synchronisiert, sobald Sie wieder online sind.
      </p>
    </div>
  )
}
```
(Tokens `bg-warning-soft`/`text-warning-strong`/`rounded-ios-xl` sind verifiziert vorhanden — wie TerminOfflineHinweis.)

- [ ] **Step 2: FlowWizardKfz sa-Render (~L806)** — `<SaSignaturStep .../>` durch Online-Gate ersetzen (Summary + Service-Wahl bleiben sichtbar; die sind via write-1-Autosave offline erfasst):
```tsx
{!isOnline ? (
  <SaOfflineHinweis />
) : (
  <SaSignaturStep
    token={token}
    leadId={lead.id}
    flowLinkId={flowLinkId ?? null}
    gutachterAnzeige={gutachterAnzeige}
    legalDocs={legalDocs}
    onSubmittingChange={setSaSubmitting}
    onSigned={(fid) => {
      setFallId(fid)
      setStepIndex(stepIndexById('account'))
    }}
  />
)}
```
Import `import SaOfflineHinweis from './SaOfflineHinweis'` neben dem `SaSignaturStep`-Import (~L47). `isOnline` existiert schon (write-1, L233).

- [ ] **Step 3: `SaSignaturStep.handleSignSA` Defense-in-Depth-Guard** (ganz oben, nach `if (!signatureBlob) return`): fängt die `useOnlineStatus`-Debounce-Race (Gate zeigt noch Form, aber real offline) + schützt den Werkstatt-Intake-Kontext (kein Gate):
```ts
if (typeof navigator !== 'undefined' && navigator.onLine === false) {
  setError('Die Beauftragung benötigt eine Internetverbindung. Bitte verbinden Sie sich und versuchen Sie es erneut.')
  return
}
```

- [ ] **Step 4:** `npx vitest run src/app/flow` (SaSignaturStep.test.tsx bleibt grün — Guard ändert online-Verhalten nicht). Commit `feat(offline): fence SA-sign offline (online-only Beauftragung)`.

---

## Task 2: Token-TTL-Dead-Letter (drain conflict-Handling)

**Files:** Modify `src/lib/offline/sync.ts` + `src/lib/offline/sync.test.ts`.

- [ ] **Step 1: Failing test** in `sync.test.ts` (`describe('drainOutbox — single replay')`):
```ts
it('dead-letters an op whose handler returns conflict (persist + count failed, not synced)', async () => {
  registerHandler({ kind: 'conf', replay: async () => ({ outcome: 'conflict', error: 'Link abgelaufen' }) })
  const { id } = await enqueueOp({ kind: 'conf', replay_class: 'B', payload: {} })
  const res = await drainOutbox()
  expect(res.synced).toBe(0)
  expect(res.failed).toBe(1)
  const op = await offlineDB.mutation_outbox.get(id)
  expect(op?.status).toBe('dead')
  expect(op?.last_error).toBe('Link abgelaufen')
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/offline/sync.test.ts` → FAIL (heute: conflict → removeOp + synced++, also op weg + synced=1).

- [ ] **Step 3: Fix** `sync.ts` single-replay-Zweig (die `if (done||conflict){removeOp;synced++} else {failed}`-Logik in 3-Wege aufteilen):
```ts
if (handler.replay) {
  for (const op of kindOps) {
    if (!op.id) continue
    await markOp(op.id, 'uploading')
    const result = await handler.replay(op)
    if (result.outcome === 'done') {
      await removeOp(op.id)
      synced++
    } else if (result.outcome === 'conflict') {
      // Nicht-transient (z.B. Flow-Token abgelaufen): NICHT still droppen und NICHT als
      // synced zählen (das wäre eine Lüge). Als Dead-Letter behalten (inspizierbar,
      // vom künftigen All-Kinds-Dead-Letter-UI surfac-/dismissbar) + ehrlich als failed.
      await markOp(op.id, 'dead', result.error)
      failed++
    } else {
      await markOp(op.id, 'failed', result.error)
      failed++
    }
  }
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/offline/sync.test.ts` → PASS (alle, inkl. done/retry/batch unverändert). Commit `fix(offline): dead-letter conflict ops instead of silent drop (token-TTL)`.

---

## Task 3: Verifikation + PR

- [ ] **Step 1:** `npx vitest run src/lib/offline` grün (inkl. neuer conflict-Test).
- [ ] **Step 2: Scoped tsc** (temp `tsconfig.w3-check.json`, include `src/lib/offline/**` + `src/app/flow/**` + `src/app/gutachter/**` wegen Werkstatt-Intake-Guard? — nein, WerkstattIntakeSignatur liegt in flow) → 0; delete.
- [ ] **Step 3: 4 Ratchets** → 0 neu (SaOfflineHinweis nutzt warning-Tokens, kein Hex/Button/Status-Map).
- [ ] **Step 4: Full-Regression** `npm test` — gegen bekannten basis-inhärenten + Flaky-unter-Last-Satz gegenprüfen (0 Regression: mein Diff hat keinen Import-Pfad zu einem Fail; SaSignaturStep.test.tsx grün).
- [ ] **Step 5: Commit-Body-Reasoning:** online-Pfad unverändert (Gate/Guard auf `!navigator.onLine`); conflict-Änderung 0 Effekt auf Upload/GPS (syncOutbox upload-only, kein conflict); All-Kinds-Surfacing = dokumentierte Folge-Slice.
- [ ] **Step 6: Push + PR** stacked auf write-2:
```bash
git push -u origin kitta/offline-first-slice2-write3
gh pr create --base kitta/offline-first-slice2-write2 --title "feat(offline): Slice 2-write-3 - SA-sign fence + token-TTL dead-letter" --body-file <body>
```

## Self-Review
- **Spec coverage:** SA-Fence (Task 1) + Token-TTL-Dead-Letter-Datenschicht (Task 2). All-Kinds-Surfacing bewusst deferred (Shim-Note-Folge-Slice, cross-surface). ✓
- **Risk:** conflict→dead persistiert Dead-Ops in mutation_outbox ohne Dismiss-UI (bounded: nur bei Token-Expiry-während-offline; Field-Sets winzig, Doc-Uploads selten) → Folge-Slice räumt via All-Kinds-DeadLetterDialog. Dokumentiert.
- **Type-Konsistenz:** `markOp(id,'dead',error)` trifft den generischen Branch (setzt status='dead'+last_error) — verifiziert an enqueue.ts. SaOfflineHinweis default-export wie TerminOfflineHinweis.
