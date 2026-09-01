# KI-Task-Executor P1 (UI: Button + Confirm-Modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Der „✨ Per KI erledigen"-Button auf den Admin-Kanban-Task-Cards (nur bei KI-fähigen Typen) + ein Bestätigungs-Modal für consequential-Pläne, verdrahtet an die P0-Server-Actions.

**Architecture:** Ein Client-Component `KiExecuteButton` rendert den Fußzeilen-Button (Sichtbarkeit via `executableTypeFor`), ruft `starteKiAusfuehrung`; all-safe → `router.refresh()`; consequential → `primitives.Modal` mit Plan-Vorschau → `bestaetigeKiAusfuehrung`/`brichAbKiAusfuehrung`. `page.tsx` liefert `claim_id` mit; `KanbanBoard.Task` bekommt `claim_id`.

**Tech Stack:** React (Client-Component), Next.js 15, `@/components/primitives` (Button, Modal), Vitest (component test optional), Playwright (prod-smoke post-deploy).

## Global Constraints
- **Component-Set-Policy:** Button = `primitives.Button` (`variant`/`onClick`/`loading`/`iconLeft`/`fullWidth`/`size`), Modal = `primitives.Modal` (`open`/`onClose`/`maxWidth`/`ariaLabel`). KEIN handgerolltes `<button>`/`<div>`-Markup. Import-Pfad exakt wie `NewTaskDialog` in `KanbanBoard.tsx` (dort wird `Modal` schon importiert) — vor dem Bau nachsehen.
- **Status-Registry-Ratchet:** KEINE inline Status-Farb-Ternaries (`risk === 'x' ? 'bg-…' : '…'`) in `src/app`/`src/components`. Risk-Kennzeichnung rein textlich / Claimondo-Token (`text-claimondo-ondo`, `text-danger` für Fehler) — kein Status-Farbschema.
- **Umlaute Pflicht** in allen sichtbaren Strings (UI): „Per KI erledigen", „Bestätigen & ausführen", „Abbrechen", „KI-Plan bestätigen", Fehlertexte.
- **Server-Actions liefern `{ ok, … }`** (P0) — Caller prüft `r.ok`, kein try/catch um die Action.
- **Branding:** `bg-claimondo-*`/`text-claimondo-*`/`border-claimondo-border`, `rounded-ios-*`. Kein inline-hex.
- **`executableTypeFor`** muss client-importierbar bleiben (registry.ts hat keine Server-Deps — nur `./types`). ✓
- **KRITISCH — Kill-Switch-Sichtbarkeit (Dark-Ship):** Der Button darf NUR erscheinen, wenn der Executor aktiviert ist. Sonst wäre er nach dem Merge-Session-Deploy sofort für ALLE Admin/KB sichtbar und würde beim Klick nur „KI-Ausfuehrung ist deaktiviert" melden (Kill-Switch default off) — eine sichtbar kaputte Funktion für alle. Daher: `page.tsx` (Server-Component) liest `isExecutorEnabled()` aus `@/lib/task-executor/policy` und reicht `executorEnabled: boolean` an `KanbanBoard` → `TaskCard` → `KiExecuteButton` durch (**gleicher Threading-Weg wie `reassignCandidates`**). `KiExecuteButton` rendert `null` bei `!executorEnabled`. So bleibt das Feature unsichtbar bis `TASK_EXECUTOR_ENABLED=true` bewusst gesetzt wird.

---

## Task 1: `claim_id` in Query + KanbanBoard-Task-Typ, `executableTypeFor`-Param lockern

**Files:**
- Modify: `src/app/admin/tasks/page.tsx` (tasks-`select` um `claim_id` ergänzen)
- Modify: `src/app/admin/tasks/KanbanBoard.tsx` (`Task`-Type: `claim_id: string | null` ergänzen)
- Modify: `src/lib/task-executor/registry.ts` (`executableTypeFor`-Param → `Pick<TaskRow,'typ'|'claim_id'|'status'>`)
- Test: `src/lib/task-executor/registry.test.ts` (bestehende Tests müssen grün bleiben)

**Interfaces:**
- Produces: `KanbanBoard.Task` trägt `claim_id`; `executableTypeFor(task: Pick<TaskRow,'typ'|'claim_id'|'status'>)`.

- [ ] **Step 1: `page.tsx` — `claim_id` in die tasks-Query**

In der `.from('tasks').select('…')`-Liste (aktuell endet mit `…auto_resolved_am, auto_resolved_grund`) `claim_id` ergänzen. Exakt in `src/app/admin/tasks/page.tsx` die select-Zeile um `, claim_id` erweitern (die Query lädt sonst kein claim_id → Button nie sichtbar).

- [ ] **Step 2: `KanbanBoard.tsx` — `Task`-Type**

Im `type Task = { … }` (Feld-Block mit `id, fall_id, lead_id, typ, task_typ, titel, …`) ergänzen:
```typescript
  claim_id: string | null
```

- [ ] **Step 3: `registry.ts` — Param lockern (DRY für den Client)**

```typescript
export function executableTypeFor(task: Pick<TaskRow, 'typ' | 'claim_id' | 'status'>) {
```
(Body unverändert. TaskRow erfüllt das Pick → alle bestehenden Aufrufe + Tests bleiben gültig.)

- [ ] **Step 4: registry-Tests laufen**

Run: `npx vitest run src/lib/task-executor/registry.test.ts`
Expected: 6/6 grün (Tests übergeben volle TaskRow-Objekte, die das Pick erfüllen).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/tasks/page.tsx src/app/admin/tasks/KanbanBoard.tsx src/lib/task-executor/registry.ts
git commit -m "feat(ki-task-executor): claim_id in tasks-query/Task-typ + executableTypeFor auf Pick lockern"
```

---

## Task 2: `KiExecuteButton` (Button + Confirm-Modal) + Einbau in TaskCard

**Files:**
- Create: `src/app/admin/tasks/KiExecuteButton.tsx`
- Modify: `src/app/admin/tasks/KanbanBoard.tsx` (Import + `<KiExecuteButton task={task} />` in `TaskCard`-Fußzeile)

**Interfaces:**
- Consumes: `starteKiAusfuehrung`/`bestaetigeKiAusfuehrung`/`brichAbKiAusfuehrung` from `./ki-actions`; `executableTypeFor` from `@/lib/task-executor/registry`; `PlanStep` from `@/lib/task-executor/types`; `primitives.Button`, `primitives.Modal`.
- Produces: `export function KiExecuteButton({ task }: { task: KiButtonTask })`.

- [ ] **Step 1: Import-Pfade der Primitives verifizieren**

In `KanbanBoard.tsx` nachsehen, wie `Modal` importiert wird (NewTaskDialog nutzt es) — denselben Pfad verwenden. `Button` analog (`@/components/primitives/Button/Button.web` oder Barrel `@/components/primitives`). Prop-API: `Button` hat `variant: 'navy'|'ondo'|'ghost'|'bare'|'danger'|'success'`, `size: 'sm'|'md'|'lg'|'icon'`, `onClick`, `loading`, `disabled`, `iconLeft`, `fullWidth`, `className`. `Modal` hat `open`, `onClose`, `maxWidth`, `noPadding`, `hideCloseButton`, `ariaLabel`.

- [ ] **Step 2: `KiExecuteButton.tsx` schreiben**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives/Button/Button.web'   // ← an KanbanBoard-Import angleichen
import { Modal } from '@/components/primitives/Modal/Modal.web'       // ← an KanbanBoard-Import angleichen
import { executableTypeFor } from '@/lib/task-executor/registry'
import { starteKiAusfuehrung, bestaetigeKiAusfuehrung, brichAbKiAusfuehrung } from './ki-actions'
import type { PlanStep } from '@/lib/task-executor/types'

export type KiButtonTask = { id: string; typ: string | null; claim_id: string | null; status: string }

function stepPreview(step: PlanStep): string {
  const a = step.args as Record<string, unknown>
  switch (step.verb) {
    case 'sende_kommunikation':
      return `Nachricht an Kunde — Vorlage „${String(a.trigger ?? '')}"${a.variablen && Object.keys(a.variablen as object).length ? ` (${JSON.stringify(a.variablen)})` : ''}`
    case 'setze_status':
      return `Status setzen → „${String(a.neuer_status ?? '')}" (${String(a.grund ?? '')})`
    case 'interne_notiz':
      return `Interne Notiz: ${String(a.text ?? '')}`
    case 'task_schliessen':
      return `Aufgabe schließen: ${String(a.ergebnis ?? '')}`
    default:
      return step.verb
  }
}

export function KiExecuteButton({ task, executorEnabled }: { task: KiButtonTask; executorEnabled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ execId: string; steps: PlanStep[]; begruendung: string } | null>(null)

  if (!executorEnabled || !executableTypeFor(task)) return null

  function starten() {
    setError(null)
    startTransition(async () => {
      const r = await starteKiAusfuehrung(task.id)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      if (r.execution?.status === 'warte_bestaetigung') {
        setPlan({ execId: r.execution.id, steps: r.execution.plan, begruendung: r.execution.begruendung })
      } else {
        router.refresh()
      }
    })
  }

  function bestaetigen() {
    if (!plan) return
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeKiAusfuehrung(plan.execId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      setPlan(null)
      router.refresh()
    })
  }

  function abbrechen() {
    const execId = plan?.execId
    setPlan(null)
    setError(null)
    if (!execId) return
    startTransition(async () => {
      await brichAbKiAusfuehrung(execId)
      router.refresh()
    })
  }

  return (
    <div
      className="mt-2 pt-2 border-t border-claimondo-border"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button variant="ghost" size="sm" fullWidth loading={pending} onClick={starten} ariaLabel="Aufgabe per KI erledigen">
        ✨ Per KI erledigen
      </Button>
      {error && !plan && <p className="mt-1 text-danger text-body-xs">{error}</p>}

      {plan && (
        <Modal open onClose={abbrechen} maxWidth={480} ariaLabel="KI-Plan bestätigen">
          <div className="space-y-3">
            <h3 className="text-claimondo-navy font-semibold">KI-Plan bestätigen</h3>
            {plan.begruendung && <p className="text-body-sm text-claimondo-ondo">{plan.begruendung}</p>}
            <ul className="space-y-1.5 list-disc pl-4">
              {plan.steps.map((s, i) => (
                <li key={i} className="text-body-sm text-claimondo-navy">{stepPreview(s)}</li>
              ))}
            </ul>
            {error && <p className="text-danger text-body-xs">{error}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={abbrechen} disabled={pending}>Abbrechen</Button>
              <Button variant="navy" onClick={bestaetigen} loading={pending}>Bestätigen &amp; ausführen</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 3: In `KanbanBoard.tsx` einbauen**

Import oben ergänzen: `import { KiExecuteButton } from './KiExecuteButton'`.
In `TaskCard` **nach** dem Reassign-Dropdown-Block (dem letzten Element vor dem schließenden Card-`</div>`) einfügen:
```tsx
      <KiExecuteButton task={{ id: task.id, typ: task.typ, claim_id: task.claim_id, status: task.status }} executorEnabled={executorEnabled} />
```
Dazu muss `executorEnabled` bis hierher durchgereicht werden: `page.tsx` berechnet `const executorEnabled = isExecutorEnabled()` (Import aus `@/lib/task-executor/policy`) und übergibt es an `<KanbanBoard executorEnabled={executorEnabled} … />`; `KanbanBoard`-Props + `TaskCard`-Props bekommen `executorEnabled: boolean` (Default `false`) und reichen es weiter — exakt wie `reassignCandidates` bereits durchgereicht wird.
(Der Button rendert `null`, wenn `!executorEnabled` ODER `executableTypeFor` null liefert — kein Platz-Verbrauch bei nicht-KI-fähigen Cards und unsichtbar solange der Kill-Switch aus ist.)

- [ ] **Step 4: Typecheck (targeted; full build ggf. OOM = bekannt)**

Run: `npx tsc --noEmit` — wenn OOM, gezielt die berührten Files prüfen. Kein Typfehler in `KiExecuteButton.tsx`/`KanbanBoard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/tasks/KiExecuteButton.tsx src/app/admin/tasks/KanbanBoard.tsx
git commit -m "feat(ki-task-executor): KiExecuteButton (Footer-Button + Confirm-Modal) in Kanban-TaskCard"
```

---

## Task 3: Playwright-Smoke-Spec (läuft post-deploy)

**Files:**
- Create: `tests/e2e/flows/ki-task-executor-smoke.spec.ts`

**Interfaces:** Konsumiert nichts aus der App; fährt gegen `PLAYWRIGHT_BASE_URL` (prod nach Deploy + Kill-Switch an).

- [ ] **Step 1: Spec schreiben** (Header-Kommentar mit Run-Befehl; test.skip wenn Kill-Switch/kein Login)

```typescript
// Run (post-deploy, nach TASK_EXECUTOR_ENABLED=true):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/ki-task-executor-smoke.spec.ts --headed
// Test-Konto: test-dispatch@claimondo.de / <PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>  (Admin-Kanban /admin/tasks)
import { test, expect } from '@playwright/test'

test('KI-Executor: Button auf KI-faehiger Task -> Plan/Confirm', async ({ page }) => {
  // Login (App nutzt @supabase/ssr Cookie; hier UI-Login)
  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill('test-dispatch@claimondo.de')
  await page.getByLabel(/passwort/i).fill('<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>')
  await page.getByRole('button', { name: /anmelden|login/i }).click()
  await page.waitForURL(/\/(admin|dispatch|faelle)/)

  await page.goto('/admin/tasks')
  const kiButton = page.getByRole('button', { name: /Per KI erledigen/i }).first()
  // Wenn kein KI-faehiger Task sichtbar (oder Kill-Switch aus) -> skip statt Fehlschlag.
  if ((await kiButton.count()) === 0) test.skip(true, 'Kein KI-faehiger Task sichtbar (Kill-Switch aus oder keine Tasks)')

  await kiButton.click()
  // Entweder Confirm-Modal (consequential) oder direkte Erledigung (safe).
  const modal = page.getByRole('heading', { name: /KI-Plan bestätigen/i })
  await expect(modal.or(page.getByText(/erledigt/i))).toBeVisible({ timeout: 15000 })
})
```

- [ ] **Step 2: Nicht lokal ausführen** (Branch nicht deployt). Commit die Spec:

```bash
git add tests/e2e/flows/ki-task-executor-smoke.spec.ts
git commit -m "test(ki-task-executor): prod-playwright-smoke-spec (post-deploy)"
```

- [ ] **Step 3: Notieren:** Prod-Smoke-Schritte im PR-Body dokumentieren (Deploy → `TASK_EXECUTOR_ENABLED=true` → Spec gegen app.claimondo.de → Button → Plan/Confirm → Task erledigt + `ai_task_executions`-Row).

---

## Nach P1
Finale Whole-Branch-Review (opus) über P0+P1 → 7-Punkte-Audit → `npm run build` + Ratchets (jetzt clean, da UI-Consumer verdrahtet) → PR gegen `staging`. Prod-Playwright-Smoke nach Deploy + Kill-Switch-Aktivierung.
