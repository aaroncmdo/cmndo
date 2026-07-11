# Aufgaben + KI-Vorschläge → ein Pill-Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/aufgaben` wird die eine Admin-Fläche mit 3 Pills (`KI-Vorschläge · Alle Aufgaben · Meine Aufgaben`); die KI-Vorschlags-Inbox zieht als Pill ein, der eigene Nav-Eintrag entfällt, das Kanban bleibt unverändert.

**Architecture:** Route-basierte Pills — das bestehende `aufgaben/layout.tsx` (Client, `usePathname`) rendert eine neue `AufgabenPills`-Leiste; neue Sub-Route `aufgaben/vorschlaege` übernimmt die Logik von `ai-vorschlaege/page.tsx`; die Alt-Route wird per `next.config`-308-Redirect umgeleitet und ihre `page.tsx` gelöscht. Kein DB-Change.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind (Claimondo-Tokens), vitest, `@/components/primitives/Button`, `RealtimeCountBadge`.

## Global Constraints

- **Kein Direct-Push auf main** — Feature-Branch `kitta/aufgaben-vorschlaege-merge`, PR gegen `staging`.
- **Redirects nur via `next.config.ts`** (Redirect-Stub-Gate) — NIE eine reine Redirect-`page.tsx`.
- **UI-Strings auf Deutsch mit echten Umlauten** (`ä/ö/ü/ß`).
- **Server-Actions liefern `{ ok: boolean; error?: string }`** (kein throw-Mix).
- **Farben = Claimondo-Tokens** (`bg-claimondo-navy` etc.), keine Tailwind-Defaults / kein bracket-hex.
- **Radien = `rounded-ios-{sm,md,lg,xl}`**; Typo = `text-caption`/`text-body-sm`/`text-heading-*`.
- **Kein DDL / keine Migration.**
- Nach jeder Route/Layout/Action-Änderung: **voller `npm run build`**, nicht nur `tsc`.

---

### Task 1: `AufgabenPills` — die Pill-Leiste (pure, testbar)

**Files:**
- Create: `src/app/admin/aufgaben/_components/AufgabenPills.tsx`
- Test: `src/app/admin/aufgaben/_components/AufgabenPills.test.ts`

**Interfaces:**
- Produces: `AufgabenPills({ activePath }: { activePath: string })` — reine Client-Komponente,
  rendert 3 Pills; markiert die Pill aktiv, deren `href` Präfix von `activePath` ist; die
  KI-Vorschläge-Pill enthält `<AdminAiVorschlaegeBadge variant="counter" />` (self-fetching Count).
  Exportiert zusätzlich `PILLS` (Array) + `pillActive(activePath, href): boolean` (pure) — nur
  diese werden im `environment='node'`-Vitest getestet (kein Render, keine testing-library).

- [ ] **Step 1: Failing test** — `src/app/admin/aufgaben/_components/AufgabenPills.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { PILLS, pillActive } from './AufgabenPills'

// environment='node' (kein jsdom / keine testing-library): reine Logik testen, kein Render.
describe('AufgabenPills-Logik', () => {
  it('PILLS hat 3 Einträge mit korrekten hrefs + Labels', () => {
    expect(PILLS.map((p) => p.href)).toEqual([
      '/admin/aufgaben/vorschlaege',
      '/admin/aufgaben/alle',
      '/admin/aufgaben/meine',
    ])
    expect(PILLS.map((p) => p.label)).toEqual(['KI-Vorschläge', 'Alle Aufgaben', 'Meine Aufgaben'])
  })
  it('pillActive: exakte Route ist aktiv', () => {
    expect(pillActive('/admin/aufgaben/vorschlaege', '/admin/aufgaben/vorschlaege')).toBe(true)
  })
  it('pillActive: fremde Route ist nicht aktiv', () => {
    expect(pillActive('/admin/aufgaben/alle', '/admin/aufgaben/vorschlaege')).toBe(false)
  })
  it('pillActive: Sub-Pfad matcht per Präfix', () => {
    expect(pillActive('/admin/aufgaben/alle/detail', '/admin/aufgaben/alle')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/app/admin/aufgaben/_components/AufgabenPills.test.ts`
Expected: FAIL — `Cannot find module './AufgabenPills'`.

- [ ] **Step 3: Implement** — `src/app/admin/aufgaben/_components/AufgabenPills.tsx`

```tsx
'use client'

import Link from 'next/link'
import { AdminAiVorschlaegeBadge } from '@/components/admin/AdminAiVorschlaegeBadge'

type Pill = { href: string; label: string; badge?: 'vorschlaege' }

export const PILLS: Pill[] = [
  { href: '/admin/aufgaben/vorschlaege', label: 'KI-Vorschläge', badge: 'vorschlaege' },
  { href: '/admin/aufgaben/alle', label: 'Alle Aufgaben' },
  { href: '/admin/aufgaben/meine', label: 'Meine Aufgaben' },
]

// Pure — direkt unit-testbar (environment='node', kein Render nötig).
export function pillActive(activePath: string, href: string): boolean {
  return activePath === href || activePath.startsWith(href + '/')
}

export function AufgabenPills({ activePath }: { activePath: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Aufgaben-Bereiche">
      {PILLS.map((p) => {
        const active = pillActive(activePath, p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-ios-lg px-3.5 py-1.5 text-body-sm font-medium transition-colors ${
              active
                ? 'bg-claimondo-navy text-white'
                : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            {p.label}
            {p.badge === 'vorschlaege' && (
              <AdminAiVorschlaegeBadge variant="counter" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/app/admin/aufgaben/_components/AufgabenPills.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/aufgaben/_components/AufgabenPills.tsx src/app/admin/aufgaben/_components/AufgabenPills.test.ts
git commit -m "feat(aufgaben): AufgabenPills — Pill-Leiste (Vorschlaege/Alle/Meine) mit Count-Badge"
```

---

### Task 2: Layout auf Pills umstellen (Underline-Tabs → Pills, kein Header)

**Files:**
- Modify: `src/app/admin/aufgaben/layout.tsx` (kompletter Ersatz des Nav-Blocks)

**Interfaces:**
- Consumes: `AufgabenPills` aus Task 1.

- [ ] **Step 1: Layout ersetzen** — `src/app/admin/aufgaben/layout.tsx`

```tsx
'use client'

// AAR-531 → Aufgaben-Hub: Pill-Leiste (KI-Vorschlaege / Alle / Meine). Kein PageHeader.
import { usePathname } from 'next/navigation'
import { AufgabenPills } from './_components/AufgabenPills'

export default function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6 py-2.5">
        <AufgabenPills activePath={pathname} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: tsc**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "aufgaben|AufgabenPills" || echo "clean"`
Expected: `clean` (keine Fehler in den berührten Files; jsqr/@turf-Worktree-Artefakte ignorieren).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/aufgaben/layout.tsx
git commit -m "feat(aufgaben): Layout auf Pill-Leiste umgestellt (kein PageHeader)"
```

---

### Task 3: `AiVorschlaegeClient` headerless-Modus

**Files:**
- Modify: `src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx:34-77`

**Interfaces:**
- Produces: `AiVorschlaegeClient({ vorschlaege, headerless? })` — `headerless` (default `false`)
  unterdrückt das `<h1>KI-Vorschläge</h1>` (die Pill ist der Titel). Zähler bleibt.

- [ ] **Step 1: Prop + Signatur ändern** — ersetze den Funktionskopf und beide `<h1>`-Stellen.

Signatur (Zeile 34-38):
```tsx
export function AiVorschlaegeClient({
  vorschlaege,
  headerless = false,
}: {
  vorschlaege: AiProposal[]
  headerless?: boolean
}) {
```

Empty-State (Zeile 61-70) — `<h1>` konditional:
```tsx
  if (!vorschlaege.length) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        {!headerless && <h1 className="text-heading-md text-claimondo-navy mb-4">KI-Vorschläge</h1>}
        <p className="text-body-sm text-claimondo-ondo">Keine offenen KI-Vorschläge.</p>
      </div>
    )
  }
```

Liste (Zeile 72-77) — `<h1>` konditional:
```tsx
  return (
    <div className="max-w-3xl mx-auto p-5 space-y-4">
      {!headerless && <h1 className="text-heading-md text-claimondo-navy">KI-Vorschläge</h1>}
      <p className="text-body-sm text-claimondo-ondo">
        {vorschlaege.length} offener{vorschlaege.length !== 1 ? 'e' : ''} Vorschlag{vorschlaege.length !== 1 ? 'e' : ''}
      </p>
```

- [ ] **Step 2: tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep AiVorschlaege || echo clean` → `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx
git commit -m "feat(ai-vorschlaege): headerless-Prop (Titel entfaellt unter der Pill)"
```

---

### Task 4: Neue Route `aufgaben/vorschlaege` (Inbox + GraduierungPanel)

**Files:**
- Create: `src/app/admin/aufgaben/vorschlaege/page.tsx`

**Interfaces:**
- Consumes: `AiVorschlaegeClient` (headerless, Task 3); `listOpenProposals`, `getTypeStats`,
  `GraduierungPanel`, `SectionCard` (unverändert aus dem Bestand).

- [ ] **Step 1: Page erstellen** — 1:1 die Logik aus `ai-vorschlaege/page.tsx`, nur `headerless` + Import-Pfade.

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listOpenProposals } from '@/lib/orchestrator/proposals'
import { getTypeStats } from '@/lib/orchestrator/stats'
import { SectionCard } from '@/components/shared/SectionCard'
import { GraduierungPanel } from '@/components/admin/GraduierungPanel'
import { AiVorschlaegeClient } from '../../ai-vorschlaege/AiVorschlaegeClient'

export const dynamic = 'force-dynamic'

export default async function AufgabenVorschlaegePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (p?.rolle !== 'admin') redirect('/login')

  const [vorschlaege, typeStats] = await Promise.all([listOpenProposals(), getTypeStats()])

  return (
    <>
      <AiVorschlaegeClient vorschlaege={vorschlaege} headerless />
      <div className="max-w-4xl mx-auto px-5 pb-8">
        <SectionCard
          title="Auto-Graduierung"
          subtitle="Vorschlagstypen mit ausreichender Annahme-Quote (≥ 80 % bei ≥ 30 Entscheidungen) können auf automatische Ausführung graduiert werden."
        >
          <GraduierungPanel stats={typeStats} />
        </SectionCard>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Voller Build** (neue Route)

Run: `npm run build 2>&1 | tail -20`
Expected: Build erfolgreich; Route `/admin/aufgaben/vorschlaege` in der Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/aufgaben/vorschlaege/page.tsx
git commit -m "feat(aufgaben): Sub-Route vorschlaege — KI-Inbox + GraduierungPanel"
```

---

### Task 5: Redirects + Alt-Page löschen + revalidatePath

**Files:**
- Modify: `next.config.ts` (im `redirects()`-Array, nach Zeile 268)
- Delete: `src/app/admin/ai-vorschlaege/page.tsx`
- Modify: `src/app/admin/ai-vorschlaege/actions.ts` (4× `revalidatePath`)

**Interfaces:**
- Consumes: Route aus Task 4 (`/admin/aufgaben/vorschlaege`).

- [ ] **Step 1: Zwei Redirects ergänzen** — in `next.config.ts` im `redirects()`-Array (neben `{ source: '/admin/tasks', destination: '/admin/aufgaben/alle', permanent: true }`):

```ts
      { source: '/admin/ai-vorschlaege', destination: '/admin/aufgaben/vorschlaege', permanent: true },
      { source: '/admin/aufgaben', destination: '/admin/aufgaben/alle', permanent: true },
```

(Der zweite fixt zusätzlich, dass `/admin/aufgaben` bare bisher keine `page.tsx`/Redirect hatte.)

- [ ] **Step 2: Alt-Page löschen**

```bash
git rm src/app/admin/ai-vorschlaege/page.tsx
```

(`AiVorschlaegeClient.tsx` + `actions.ts` bleiben — werden von Task 4 bzw. dem Badge weiter importiert.)

- [ ] **Step 3: revalidatePath umziehen** — in `src/app/admin/ai-vorschlaege/actions.ts` alle
`revalidatePath('/admin/ai-vorschlaege')` → `revalidatePath('/admin/aufgaben/vorschlaege')`
(betrifft `annehmenVorschlag`, `verwerfenVorschlag`, `graduiereTyp`, `zuruecksetzenTyp`).

Run: `grep -n "revalidatePath('/admin/ai-vorschlaege')" src/app/admin/ai-vorschlaege/actions.ts`
Expected nach Ersetzen: keine Treffer.

- [ ] **Step 4: Voller Build + Redirect-Stub-Ratchet**

Run: `npm run build 2>&1 | tail -15 && npm run check:redirect-stubs -- --ratchet 2>&1 | tail -5`
Expected: Build grün; Redirect-Stub-Ratchet grün (die gelöschte Page war die einzige Stub-Gefahr, jetzt via config).

- [ ] **Step 5: Commit**

```bash
git add next.config.ts src/app/admin/ai-vorschlaege/actions.ts
git commit -m "feat(aufgaben): 308-Redirect ai-vorschlaege+aufgaben -> Sub-Routen, Alt-Page geloescht"
```

---

### Task 6: Kanban headerless (PageHeader → schlanke Aktionszeile)

**Files:**
- Modify: `src/app/admin/tasks/KanbanBoard.tsx` (Import `PageHeader` entfernen; Block Zeile ~280-308 ersetzen)

**Interfaces:**
- Consumes: bestehender KanbanBoard-State (`localTasks`, `tasks`, `linked`, `showAutoResolved`,
  `setShowAutoResolved`, `setDialogOpen`).

- [ ] **Step 1: `PageHeader`-Import entfernen** — Zeile `import PageHeader from '@/components/shared/PageHeader'` löschen.

- [ ] **Step 2: Header-Block ersetzen** — den `<div className="mb-6"><PageHeader … /></div>`-Block durch eine schlanke Aktionszeile ersetzen (Zähler links, Aktionen rechts; kein Titel):

```tsx
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-claimondo-ondo">
            {localTasks.length} von {tasks.length} Aufgaben
            {tasks.length !== linked.length
              ? ` (${tasks.length - linked.length} ohne Objekt-Bezug ausgeblendet)`
              : ''}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-caption text-claimondo-ondo cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAutoResolved}
                onChange={(e) => setShowAutoResolved(e.target.checked)}
                className="rounded border-claimondo-border"
              />
              Auto-erledigte anzeigen
            </label>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-4 py-2 bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-medium rounded-ios-xl transition-colors"
            >
              + Neuer Task
            </button>
          </div>
        </div>
```

(Der „+ Neuer Task"-Button bleibt wie im Bestand — kein neuer Component-Set-Verstoß; optionaler Boy-Scout auf `primitives.Button` möglich, hier out-of-scope.)

- [ ] **Step 3: tsc + Component-Set-Ratchet**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep KanbanBoard || echo clean` → `clean`
Run: `npm run check:component-set -- --ratchet 2>&1 | tail -5` → grün (keine neuen Verstöße; PageHeader-Entfernung senkt eher).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/tasks/KanbanBoard.tsx
git commit -m "feat(aufgaben): Kanban headerless — PageHeader raus, schlanke Aktionszeile"
```

---

### Task 7: AdminNav konsolidieren (ein Eintrag, Vorschlags-Badge)

**Files:**
- Modify: `src/app/admin/_components/AdminNav.tsx`

- [ ] **Step 1: KI-Vorschläge-NAV_ITEM entfernen** — Zeile `{ href: '/admin/ai-vorschlaege', label: 'KI-Vorschläge', icon: SparklesIcon },` löschen.

- [ ] **Step 2: `SparklesIcon`-Import entfernen** — aus dem `lucide-react`-Import (nur dort genutzt).

- [ ] **Step 3: `renderBadge` anpassen** — die „Aufgaben"-Branch trägt jetzt den Vorschlags-Badge;
die „KI-Vorschläge"-Branch entfällt. Ersetze beide Branches:

```tsx
        if (item.label === 'Aufgaben') {
          return <span className="ml-auto"><AdminAiVorschlaegeBadge /></span>
        }
        if (item.label === 'Kalender') {
          return <span className="ml-auto"><AdminNeueRueckrufeBadge /></span>
        }
        return null
```

(Der `meineTasksCount`-Badge auf „Aufgaben" entfällt — „meine Tasks" bleibt über den
`TasksPill` im Header sichtbar. `meineTasksCount`-Prop weiter genutzt vom `TasksPill`.)

- [ ] **Step 4: Voller Build** — `npm run build 2>&1 | tail -12` → grün, keine „unused SparklesIcon"-Warnung.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/_components/AdminNav.tsx
git commit -m "feat(aufgaben): AdminNav — ein 'Aufgaben'-Eintrag mit KI-Vorschlaege-Badge"
```

---

### Task 8: Gesamt-Verifikation + Smoke

**Files:** keine (Verifikation).

- [ ] **Step 1: Voller Build grün** — `npm run build 2>&1 | tail -20`.
- [ ] **Step 2: Alle Ratchets** — `npm run check:token-audit && npm run check:component-set -- --ratchet && npm run check:status-registry -- --ratchet && npm run check:redirect-stubs -- --ratchet` (knip in CI). Erwartung: grün / 0 neu.
- [ ] **Step 3: Scoped Tests** — `npx vitest run src/app/admin/aufgaben`.
- [ ] **Step 4: Redirect-Curls (nach Deploy/preview)** — `/admin/ai-vorschlaege` → 308 → `/admin/aufgaben/vorschlaege`; `/admin/aufgaben` → 308 → `/admin/aufgaben/alle` (anon, ohne Login).
- [ ] **Step 5: Manueller/Playwright-Smoke** — Nav „Aufgaben" → Pills durchklicken (Vorschläge/Alle/Meine); auf „KI-Vorschläge" einen Vorschlag **annehmen** → Task erscheint danach im „Alle"-Kanban; Nav-Badge zeigt offene-Vorschläge-Count; `alle`/`meine`/`GraduierungPanel` funktionieren.
- [ ] **Step 6: 7-Punkte-Audit im PR-Body**, PR gegen `staging`.

## Self-Review (gegen die Spec)

- **Spec-Abschnitt „Routen"** → Task 4 (vorschlaege), Task 5 (Redirects + Delete). ✓
- **„Layout & Pills"** → Task 1 (AufgabenPills) + Task 2 (Layout). ✓
- **„Vorschläge-Seite (headerless + GraduierungPanel)"** → Task 3 + Task 4. ✓
- **„Kanban headerless + Aktionszeile"** → Task 6. ✓
- **„Nav (ein Eintrag, Vorschlags-Badge)"** → Task 7. ✓
- **„Server-Actions revalidatePath"** → Task 5 Step 3. ✓
- **„Counts & Badges"** → AufgabenPills-Badge (Task 1) + Nav-Badge (Task 7). ✓
- **„Tests"** → Task 1 (Unit), Task 8 (Redirect-Curl, Smoke). ✓
- **Nicht-Ziele** (KI-Aufsicht, Quelle-Subfilter, Kanban→Liste) — kein Task berührt sie. ✓
- **Typ-Konsistenz:** `AufgabenPills({ activePath })`, `AiVorschlaegeClient({ vorschlaege, headerless })` — in allen Consumer-Tasks identisch verwendet. ✓
- **Offene Annahme:** Pill-Komponente ist projekt-lokal (`AufgabenPills`) — wenn die Vertrieb-Session (`386b3bd8`) eine kanonische shared PillNav extrahiert, später adoptieren (Boy-Scout). Kein Blocker.
