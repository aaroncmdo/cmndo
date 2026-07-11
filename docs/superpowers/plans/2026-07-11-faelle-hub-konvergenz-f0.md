# Fälle-Hub-Konvergenz F0 — Shared Case-Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold `/admin/faelle`'s 5-tab re-export glue into ONE shared Case-Shell (unified header + shared route-tab bar + de-re-exported header-less tool content) with zero data/behavior change and no route deletion.

**Architecture:** A new pure `isRouteTabActive` helper drives a new shared `RouteTabBar` client component. A local `FaelleHubHeader` composes `PageHeader` + `RouteTabBar` + a per-tab subtitle map and replaces the handrolled `FaelleHubTabs` in the hub `layout.tsx`. Each of the 4 tool tabs stops being a literal `export { default } from …` re-export and instead renders an extracted **header-less Content component** that both the standalone `/admin/*` route and the hub sub-route share.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, Tailwind v4 (claimondo tokens), vitest (env=`node`, `renderToStaticMarkup`), lucide-react icons.

## Global Constraints

- **Branch:** `kitta/faelle-hub-konvergenz-f0` (worktree `.claude/worktrees/faelle-hub-konvergenz-f0`), off `staging`. PR → `staging`. **NEVER push to main.**
- **UI-Umlaute Pflicht:** alle nutzersichtbaren Strings (Tab-Labels, Untertitel, Titel) mit echten `ä/ö/ü/ß`.
- **Komponenten-Set:** `RouteTabBar` nutzt `next/link` + Tokens (kein handgerollter `Button`/`Card`). Kein `bg-[#hex]`, kein raw Tailwind-Default-Radius (`rounded-ios-*`), keine raw Accent-Scales.
- **Status-Farben:** KEINE NEUE Status-Farb-Logik hinzufügen. Beim Extrahieren von SLA/Kanzlei-Board wandern *grandfatherte* raw-Status-Farben in neue Files → **net-zero Baseline-Relocation** (`npm run check:token-audit -- --update-baseline` + `npm run check:status-registry -- --update-baseline`), Baseline-Diff prüfen dass NUR die verschobenen Files betroffen sind. KEINE Token-/Registry-Migration in F0 (separate Boy-Scout-Aufgabe).
- **Kein DDL, keine neuen Server-Actions.** Reine Struktur.
- **Verify je Route-/Layout-Change:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (2 bekannte Worktree-Modul-Rausch-Fehler `jsqr`/`@turf/union` ignorieren) + `npm run test` (vitest) + die 4 Ratchets + `check:status-registry` + `check:redirect-stubs` **0-neu**. Voller `npm run build` lokal nicht möglich → CI-Build ist autoritativ für den Next-15-Route-Validator.
- **`export const dynamic = 'force-dynamic'`** und Auth-Guards bleiben auf JEDEM Route-File erhalten das sie heute hat.

---

### Task 1: Pure `isRouteTabActive` helper + `RouteTab` type

**Files:**
- Create: `src/components/shared/route-tabs.ts`
- Test: `src/components/shared/route-tabs.test.ts`

**Interfaces:**
- Produces: `type RouteTab = { href: string; label: string; icon?: LucideIcon; badge?: number; exact?: boolean }` and `isRouteTabActive(pathname: string | null, href: string, exact?: boolean): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shared/route-tabs.test.ts
import { describe, it, expect } from 'vitest'
import { isRouteTabActive } from './route-tabs'

describe('isRouteTabActive', () => {
  it('exact tab matches only its own path', () => {
    expect(isRouteTabActive('/admin/faelle', '/admin/faelle', true)).toBe(true)
    expect(isRouteTabActive('/admin/faelle/sla', '/admin/faelle', true)).toBe(false)
  })
  it('non-exact tab matches self and sub-paths', () => {
    expect(isRouteTabActive('/admin/faelle/sla', '/admin/faelle/sla', false)).toBe(true)
    expect(isRouteTabActive('/admin/faelle/sla/x', '/admin/faelle/sla', false)).toBe(true)
  })
  it('non-exact tab does not match a sibling prefix', () => {
    expect(isRouteTabActive('/admin/faelle/statistiken', '/admin/faelle/sla', false)).toBe(false)
  })
  it('null pathname is never active', () => {
    expect(isRouteTabActive(null, '/admin/faelle', true)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/route-tabs.test.ts`
Expected: FAIL — cannot resolve `./route-tabs`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/shared/route-tabs.ts
import type { LucideIcon } from 'lucide-react'

export type RouteTab = {
  href: string
  label: string
  icon?: LucideIcon
  badge?: number
  /** Index-Route: exact match statt startsWith (sonst matcht sie alle Sub-Routen). */
  exact?: boolean
}

/** Aktiv-State fuer eine route-basierte Tab-Leiste. Pure — ohne next/navigation testbar. */
export function isRouteTabActive(
  pathname: string | null,
  href: string,
  exact?: boolean,
): boolean {
  if (!pathname) return false
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/route-tabs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/route-tabs.ts src/components/shared/route-tabs.test.ts
git commit -m "feat(shared): isRouteTabActive helper + RouteTab type (route-based tab active-state)"
```

---

### Task 2: `RouteTabBar` shared client component

**Files:**
- Create: `src/components/shared/RouteTabBar.tsx`
- Test: `src/components/shared/RouteTabBar.test.tsx`

**Interfaces:**
- Consumes: `isRouteTabActive`, `RouteTab` from `./route-tabs`.
- Produces: `export default function RouteTabBar({ tabs, rightSlot }: { tabs: ReadonlyArray<RouteTab>; rightSlot?: ReactNode })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/RouteTabBar.test.tsx
// env=node: renderToStaticMarkup. usePathname + next/link gemockt.
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/faelle/sla' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, ...rest }, children as never)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import RouteTabBar from './RouteTabBar'

describe('RouteTabBar', () => {
  it('renders all tabs, marks the active one, renders a badge', () => {
    const html = renderToStaticMarkup(
      React.createElement(RouteTabBar, {
        tabs: [
          { href: '/admin/faelle', label: 'Liste', exact: true },
          { href: '/admin/faelle/sla', label: 'SLA' },
          { href: '/admin/faelle/reklamationen', label: 'Reklamationen', badge: 4 },
        ],
      }),
    )
    expect(html).toContain('Liste')
    expect(html).toContain('SLA')
    expect(html).toContain('aria-current="page"') // die aktive (SLA) Tab
    expect(html).toContain('>4<') // Badge
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/RouteTabBar.test.tsx`
Expected: FAIL — cannot resolve `./RouteTabBar`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shared/RouteTabBar.tsx
'use client'

// Route-basierte Tab-Leiste (jede Tab = eigene URL). Visuelle Sprache = FallakteTabs
// (Pills, claimondo-Tokens). Fuer route-basierte Hubs (z.B. /admin/faelle). Aktiv-State
// via isRouteTabActive (pure, getestet). FallakteTabs bleibt fuer State-basierte Tabs.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { isRouteTabActive, type RouteTab } from './route-tabs'

type Props = {
  tabs: ReadonlyArray<RouteTab>
  /** Optionaler Slot rechts (z.B. Aktions-Button). */
  rightSlot?: ReactNode
}

export default function RouteTabBar({ tabs, rightSlot }: Props) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Tabs">
      <ul className="flex items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => {
          const active = isRouteTabActive(pathname, tab.href, tab.exact)
          const Icon = tab.icon
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-3.5 py-2 text-sm rounded-ios-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                    : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                }`}
              >
                {Icon ? (
                  <Icon className={`w-4 h-4 ${active ? 'text-claimondo-ondo' : 'text-claimondo-ondo/70'}`} />
                ) : null}
                {tab.label}
                {tab.badge && tab.badge > 0 ? (
                  <span
                    aria-label={`${tab.badge} offen`}
                    className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-danger"
                    style={{ borderRadius: '9999px 3px 9999px 9999px' }}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
      {rightSlot ? <div className="shrink-0 py-2">{rightSlot}</div> : null}
    </nav>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/RouteTabBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/RouteTabBar.tsx src/components/shared/RouteTabBar.test.tsx
git commit -m "feat(shared): RouteTabBar — route-based tab bar (shared, token-styled)"
```

---

### Task 3: `FaelleHubHeader` (title + RouteTabBar + per-tab subtitle)

**Files:**
- Create: `src/app/admin/faelle/(hub)/FaelleHubHeader.tsx`
- Test: `src/app/admin/faelle/(hub)/FaelleHubHeader.test.tsx`

**Interfaces:**
- Consumes: `RouteTabBar`, `isRouteTabActive`, `RouteTab`, `PageHeader`.
- Produces: `export default function FaelleHubHeader({ offeneReklamationen }: { offeneReklamationen: number })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/admin/faelle/(hub)/FaelleHubHeader.test.tsx
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/faelle/sla' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, ...rest }, children as never)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import FaelleHubHeader from './FaelleHubHeader'

describe('FaelleHubHeader', () => {
  it('renders hub title, tabs, the active tab subtitle and the reklamationen badge', () => {
    const html = renderToStaticMarkup(React.createElement(FaelleHubHeader, { offeneReklamationen: 3 }))
    expect(html).toContain('Fälle') // Hub-Titel
    expect(html).toContain('SLA')
    expect(html).toContain('Pipeline-Fristen') // Untertitel der aktiven SLA-Tab
    expect(html).toContain('>3<') // Reklamationen-Badge
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/admin/faelle/(hub)/FaelleHubHeader.test.tsx"`
Expected: FAIL — cannot resolve `./FaelleHubHeader`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/admin/faelle/(hub)/FaelleHubHeader.tsx
'use client'

// Fälle-Hub-Chrome: EIN Header-Block (Titel + shared RouteTabBar + aktiver-Tab-Untertitel).
// Ersetzt die handgerollte FaelleHubTabs. Tab-Map = Single-Source (Label/Icon/Untertitel/Href).
import { usePathname } from 'next/navigation'
import { List, Clock, BarChart3, Scale, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import RouteTabBar from '@/components/shared/RouteTabBar'
import { isRouteTabActive, type RouteTab } from '@/components/shared/route-tabs'

type HubTab = Omit<RouteTab, 'badge'> & { subtitle: string }

const HUB_TABS: readonly HubTab[] = [
  { href: '/admin/faelle', label: 'Liste', icon: List, exact: true, subtitle: 'Alle Fälle nach Phase.' },
  { href: '/admin/faelle/sla', label: 'SLA', icon: Clock, subtitle: 'Pipeline-Fristen ab SA-Unterschrift — Verletzungen und Risiko.' },
  { href: '/admin/faelle/statistiken', label: 'Statistiken', icon: BarChart3, subtitle: 'Kennzahlen, Kürzungsquoten und Benchmarks.' },
  { href: '/admin/faelle/kanzlei', label: 'Kanzlei-Board', icon: Scale, subtitle: 'Zugewiesene Kanzleien und LexDrive-Kommunikation.' },
  { href: '/admin/faelle/reklamationen', label: 'Reklamationen', icon: AlertCircle, subtitle: 'SV-Reklamationen prüfen und entscheiden.' },
]

export default function FaelleHubHeader({ offeneReklamationen }: { offeneReklamationen: number }) {
  const pathname = usePathname()
  const active = HUB_TABS.find((t) => isRouteTabActive(pathname, t.href, t.exact)) ?? HUB_TABS[0]
  const tabs: RouteTab[] = HUB_TABS.map((t) => ({
    href: t.href,
    label: t.label,
    icon: t.icon,
    exact: t.exact,
    badge: t.href === '/admin/faelle/reklamationen' && offeneReklamationen > 0 ? offeneReklamationen : undefined,
  }))
  return (
    <div className="space-y-2 pt-4">
      <PageHeader title="Fälle" size="lg" />
      <RouteTabBar tabs={tabs} />
      <p className="text-sm text-claimondo-ondo">{active.subtitle}</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/admin/faelle/(hub)/FaelleHubHeader.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/faelle/(hub)/FaelleHubHeader.tsx" "src/app/admin/faelle/(hub)/FaelleHubHeader.test.tsx"
git commit -m "feat(faelle-hub): FaelleHubHeader — unified Titel + RouteTabBar + per-Tab-Untertitel"
```

---

### Task 4: Swap layout to FaelleHubHeader, delete FaelleHubTabs, drop FaelleKanban's redundant title

**Files:**
- Modify: `src/app/admin/faelle/(hub)/layout.tsx`
- Delete: `src/app/admin/faelle/(hub)/FaelleHubTabs.tsx`
- Modify: `src/app/admin/faelle/(hub)/FaelleKanban.tsx:102`

**Interfaces:**
- Consumes: `FaelleHubHeader` (Task 3).

- [ ] **Step 1: Rewrite `layout.tsx`**

Replace the whole file with:

```tsx
// AAR-526 → F0: Fälle-Hub Layout. EIN Chrome-Block (FaelleHubHeader) über 5 Sub-Views.
// Route Group `(hub)` damit /admin/faelle/[id] und /admin/faelle/anlegen das Layout NICHT erben.
import { createAdminClient } from '@/lib/supabase/admin'
import FaelleHubHeader from './FaelleHubHeader'

export const dynamic = 'force-dynamic'

async function fetchReklamationenBadge(): Promise<number> {
  const db = createAdminClient()
  const { count } = await db
    .from('reklamationen')
    .select('id', { count: 'exact', head: true })
    .in('status', ['eingereicht', 'pruefung'])
  return count ?? 0
}

export default async function FaelleHubLayout({ children }: { children: React.ReactNode }) {
  const offeneReklamationen = await fetchReklamationenBadge()
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6">
        <FaelleHubHeader offeneReklamationen={offeneReklamationen} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the handrolled tabs file**

```bash
git rm "src/app/admin/faelle/(hub)/FaelleHubTabs.tsx"
```

- [ ] **Step 3: Remove FaelleKanban's redundant `<h1>Fälle</h1>`**

In `src/app/admin/faelle/(hub)/FaelleKanban.tsx`, delete exactly line 102:

```tsx
          <h1 className="text-sm font-semibold text-claimondo-navy">Fälle</h1>
```

Leave the surrounding `<div className="flex items-center gap-2">` and the count `<span>{filtered.length}</span>` intact (the hub header now provides the "Fälle" title).

- [ ] **Step 4: Verify types + tests + no dangling import**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: no NEW errors (only the 2 known worktree module-noise errors).
Run: `npx vitest run src/components/shared "src/app/admin/faelle/(hub)"`
Expected: PASS.
Confirm nothing else imports FaelleHubTabs: `git grep -n "FaelleHubTabs" -- src` → no results.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/admin/faelle/(hub)"
git commit -m "refactor(faelle-hub): layout -> FaelleHubHeader; delete handrolled FaelleHubTabs; drop doppelten Kanban-Titel"
```

---

### Task 5: De-re-export SLA → `SlaContent`

**Files:**
- Create: `src/app/admin/sla/SlaContent.tsx`
- Modify: `src/app/admin/sla/page.tsx`
- Modify: `src/app/admin/faelle/(hub)/sla/page.tsx`

**Interfaces:**
- Produces: `export default async function SlaContent()` — der komplette SLA-Body (KPIs + Tabelle) OHNE `<PageHeader>` und OHNE den äußeren `py-6 space-y-6`-Wrapper.

- [ ] **Step 1: Create `SlaContent.tsx`**

Move the body of the current `src/app/admin/sla/page.tsx` into a new component. Concretely: copy the current default-export function, rename it `SlaContent`, and from its returned JSX **remove** the outer `<div className="py-6 space-y-6">` wrapper AND the `<PageHeader title="SLA-Monitoring" description=… />` element. Keep everything else byte-identical (KPI grid + DataTable). The component returns a fragment of the KPI grid + table. Keep the `import` lines it needs (drop the now-unused `PageHeader` import). Do NOT re-add `export const dynamic` here (it lives on the route files).

- [ ] **Step 2: Rewrite standalone `src/app/admin/sla/page.tsx`**

```tsx
// AAR-85 → F0: SLA-Monitoring Standalone-Route. Header + geteilter SlaContent.
import PageHeader from '@/components/shared/PageHeader'
import SlaContent from './SlaContent'

export const dynamic = 'force-dynamic'

export default function SlaMonitoringPage() {
  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="SLA-Monitoring"
        description="Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung."
      />
      <SlaContent />
    </div>
  )
}
```

- [ ] **Step 3: Rewrite hub `src/app/admin/faelle/(hub)/sla/page.tsx`** (was a re-export)

```tsx
// F0: SLA-Tab — header-los (Hub-Header liefert den Titel), geteilter SlaContent.
import SlaContent from '@/app/admin/sla/SlaContent'

export const dynamic = 'force-dynamic'

export default function FaelleHubSlaPage() {
  return (
    <div className="py-6 space-y-6">
      <SlaContent />
    </div>
  )
}
```

- [ ] **Step 4: Verify + net-zero baseline relocation**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → no new errors.
Run: `npm run check:token-audit` and `npm run check:status-registry`.
If either flags `src/app/admin/sla/SlaContent.tsx` for **relocated** raw-status colors:
- `npm run check:token-audit -- --update-baseline`
- `npm run check:status-registry -- --update-baseline`
- `git diff -- scripts/*baseline*.json` → confirm ONLY `admin/sla/SlaContent.tsx` was added (and `admin/sla/page.tsx` possibly removed). Abort + investigate if any unrelated file appears.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sla "src/app/admin/faelle/(hub)/sla/page.tsx" scripts/
git commit -m "refactor(faelle-hub): de-re-export SLA -> geteilter SlaContent (header-los im Hub); Baseline-Relocation net-zero"
```

---

### Task 6: De-re-export Kanzlei-Board → `KanzleiBoardContent`

**Files:**
- Create: `src/app/admin/kanzlei-board/KanzleiBoardContent.tsx`
- Modify: `src/app/admin/kanzlei-board/page.tsx`
- Modify: `src/app/admin/faelle/(hub)/kanzlei/page.tsx`

**Interfaces:**
- Produces: `export default async function KanzleiBoardContent()` — KPI + 3 Sektionen OHNE `<PageHeader>` und OHNE äußeren `py-6 space-y-6`-Wrapper.

- [ ] **Step 1: Create `KanzleiBoardContent.tsx`**

Same technique as Task 5: copy the current `kanzlei-board/page.tsx` default export, rename `KanzleiBoardContent`, remove the outer `<div className="py-6 space-y-6">` wrapper and the `<PageHeader title="Kanzlei-Board" … icon={ScaleIcon} />`. Keep the 3 sections byte-identical. Drop now-unused `PageHeader`/`ScaleIcon` imports if `ScaleIcon` is only used in the header (verify — it is used only in PageHeader here → drop it).

- [ ] **Step 2: Rewrite standalone `src/app/admin/kanzlei-board/page.tsx`**

```tsx
// AAR-64 → F0: Kanzlei-Board Standalone-Route. Header + geteilter KanzleiBoardContent.
import { ScaleIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import KanzleiBoardContent from './KanzleiBoardContent'

export const dynamic = 'force-dynamic'

export default function KanzleiBoardPage() {
  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="Kanzlei-Board"
        description="Admin-Sicht auf zugewiesene Kanzleien und LexDrive-Kommunikation. LexDrive nutzt Salesforce intern — kein eigenes Login-Portal."
        icon={ScaleIcon}
      />
      <KanzleiBoardContent />
    </div>
  )
}
```

- [ ] **Step 3: Rewrite hub `src/app/admin/faelle/(hub)/kanzlei/page.tsx`** (was a re-export)

```tsx
// F0: Kanzlei-Board-Tab — header-los, geteilter KanzleiBoardContent.
import KanzleiBoardContent from '@/app/admin/kanzlei-board/KanzleiBoardContent'

export const dynamic = 'force-dynamic'

export default function FaelleHubKanzleiPage() {
  return (
    <div className="py-6 space-y-6">
      <KanzleiBoardContent />
    </div>
  )
}
```

- [ ] **Step 4: Verify + net-zero baseline relocation**

Same as Task 5 Step 4 but for `admin/kanzlei-board/KanzleiBoardContent.tsx`. Run tsc + both audits; if flagged, `--update-baseline` for each + diff-confirm ONLY the kanzlei-board files moved.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/kanzlei-board "src/app/admin/faelle/(hub)/kanzlei/page.tsx" scripts/
git commit -m "refactor(faelle-hub): de-re-export Kanzlei-Board -> geteilter KanzleiBoardContent (header-los im Hub); Baseline-Relocation net-zero"
```

---

### Task 7: De-re-export Statistiken → `StatistikenContent` (+ `embedded` prop)

**Files:**
- Create: `src/app/admin/statistiken/StatistikenContent.tsx`
- Modify: `src/app/admin/statistiken/StatistikenClient.tsx:484`
- Modify: `src/app/admin/statistiken/page.tsx`
- Modify: `src/app/admin/faelle/(hub)/statistiken/page.tsx`

**Interfaces:**
- Produces: `export default async function StatistikenContent({ embedded }: { embedded?: boolean })` — der komplette Data-Load aus der aktuellen `statistiken/page.tsx` + `<StatistikenClient … embedded={embedded} />`.
- `StatistikenClient` bekommt neues Prop `embedded?: boolean` (default false) → versteckt seinen eigenen `<PageHeader title="Statistiken" />`.

- [ ] **Step 1: Add `embedded` prop to `StatistikenClient`**

In `StatistikenClient.tsx`: add `embedded` to the props destructure (default `false`) and wrap the header at line 484:

```tsx
// props: { …, embedded = false }
{!embedded && <PageHeader title="Statistiken" />}
```
Keep the sibling controls div (Zeitraum etc.) unchanged. (Adding a boolean prop does not add status-color violations → the file's existing baseline entry is unaffected.)

- [ ] **Step 2: Create `StatistikenContent.tsx`**

Copy the ENTIRE current default-export of `statistiken/page.tsx` (auth guard + `getUserStatistikRolle` usage + all data loads), rename it `StatistikenContent`, give it the signature `({ embedded = false }: { embedded?: boolean })`, and pass `embedded` through to the final `<StatistikenClient … embedded={embedded} />`. Keep `getUserStatistikRolle` + the exported types (`UserStatistikRolle`, `StatistikFall`, …) where they are — if they live in `page.tsx`, move them into `StatistikenContent.tsx` and re-export from `page.tsx`, OR keep them in `page.tsx` and import into Content. Prefer: move the helper + types into `StatistikenContent.tsx`, and have `page.tsx` re-export the types (`StatistikenClient` imports them from `./page`). Verify the `StatistikenClient` type import path still resolves (`import type { … } from './page'`).

- [ ] **Step 3: Rewrite standalone `src/app/admin/statistiken/page.tsx`**

```tsx
// KFZ-153 → F0: Statistiken Standalone-Route. Re-export der Typen + geteilter Content.
import StatistikenContent from './StatistikenContent'

export type { UserStatistikRolle, StatistikFall, StatistikKlassifizierung, Benchmark } from './StatistikenContent'

export default function StatistikenPage() {
  return <StatistikenContent />
}
```
(If moving the types is too invasive, keep them + `getUserStatistikRolle` in `page.tsx` and import them into `StatistikenContent.tsx` instead — either is fine as long as `StatistikenClient`'s `import type … from './page'` still resolves. Pick one and keep imports consistent.)

- [ ] **Step 4: Rewrite hub `src/app/admin/faelle/(hub)/statistiken/page.tsx`** (was a re-export)

```tsx
// F0: Statistiken-Tab — embedded (kein eigener PageHeader), geteilter Content.
import StatistikenContent from '@/app/admin/statistiken/StatistikenContent'

export default function FaelleHubStatistikenPage() {
  return <StatistikenContent embedded />
}
```

- [ ] **Step 5: Verify**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → no new errors (watch the `./page` type-import resolution).
Run: `npm run check:token-audit` + `npm run check:status-registry` → StatistikenContent is a data-loader (no status colors) → expect 0-new. StatistikenClient edit adds no violations.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/statistiken "src/app/admin/faelle/(hub)/statistiken/page.tsx"
git commit -m "refactor(faelle-hub): de-re-export Statistiken -> StatistikenContent + embedded-Prop (Header im Hub aus)"
```

---

### Task 8: De-re-export Reklamationen → `ReklamationenContent` (+ `embedded` prop)

**Files:**
- Create: `src/app/admin/reklamationen/ReklamationenContent.tsx`
- Modify: `src/app/admin/reklamationen/ReklamationenClient.tsx:51-57`
- Modify: `src/app/admin/reklamationen/page.tsx`
- Modify: `src/app/admin/faelle/(hub)/reklamationen/page.tsx`

**Interfaces:**
- Produces: `export default async function ReklamationenContent({ embedded }: { embedded?: boolean })` — Auth-Guard + Data-Load aus der aktuellen `reklamationen/page.tsx` + `<ReklamationenClient … embedded={embedded} />`.
- `ReklamationenClient` bekommt `embedded?: boolean` → versteckt seinen `<h1>Reklamationen</h1>`-Block.

- [ ] **Step 1: Add `embedded` prop to `ReklamationenClient`**

Add `embedded` to the props destructure (default `false`). Wrap the header block (currently lines 52-57 — the `<div className="mb-4 flex items-start justify-between gap-3">…</div>` containing `<h1>Reklamationen</h1>` + the `<p>`) in `{!embedded && ( … )}`. Keep the filter row + list unchanged.

- [ ] **Step 2: Create `ReklamationenContent.tsx`**

Copy the current default-export of `reklamationen/page.tsx` (the `createClient`/`createAdminClient` auth guard `if (!user) redirect('/login')` + `if (profile?.rolle !== 'admin') redirect('/admin')` + the reklamationen/SV-name/fall-nr loads), rename it `ReklamationenContent`, signature `({ embedded = false })`, and pass `embedded` to `<ReklamationenClient … embedded={embedded} />`. Keep all imports (`redirect`, `claimNummernForFaelle`, etc.).

- [ ] **Step 3: Rewrite standalone `src/app/admin/reklamationen/page.tsx`**

```tsx
// F0: Reklamationen Standalone-Route. Geteilter Content (Auth-Guard + Load innen).
import ReklamationenContent from './ReklamationenContent'

export default function AdminReklamationenPage() {
  return <ReklamationenContent />
}
```

- [ ] **Step 4: Rewrite hub `src/app/admin/faelle/(hub)/reklamationen/page.tsx`** (was a re-export)

```tsx
// F0: Reklamationen-Tab — embedded (kein eigener Header), geteilter Content.
import ReklamationenContent from '@/app/admin/reklamationen/ReklamationenContent'

export default function FaelleHubReklamationenPage() {
  return <ReklamationenContent embedded />
}
```

- [ ] **Step 5: Verify**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → no new errors.
Run: `npm run check:token-audit` + `npm run check:status-registry` → ReklamationenClient uses shared StatusBadge (no raw status colors) → expect 0-new.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/reklamationen "src/app/admin/faelle/(hub)/reklamationen/page.tsx"
git commit -m "refactor(faelle-hub): de-re-export Reklamationen -> ReklamationenContent + embedded-Prop (Header im Hub aus)"
```

---

### Task 9: Full verification, ratchets, knip, PR

**Files:** none (verification) — possibly `scripts/knip-baseline.json` (if the deleted `FaelleHubTabs.tsx` or new files shift knip; expected net-improvement).

- [ ] **Step 1: Full typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: only the 2 known worktree module-noise errors (`jsqr`, `@turf/union`).

- [ ] **Step 2: All tests**

Run: `npx vitest run src/components/shared "src/app/admin/faelle"`
Expected: PASS (route-tabs, RouteTabBar, FaelleHubHeader).

- [ ] **Step 3: All ratchets 0-new**

Run each; all must exit clean (no NEW violations vs. committed/relocated baselines):
```
npm run check:component-set
npm run check:token-audit
npm run check:status-registry
npm run check:knip
npm run check:redirect-stubs
```
- `check:component-set`: RouteTabBar is Link-based + token-styled → expect 0-new. If flagged, verify it's not mistaken for a handrolled Button/Card; adjust or `-- --update-baseline` only if a genuine net-zero.
- `check:knip`: deleting `FaelleHubTabs.tsx` removes a file (fine); all new files are imported (RouteTabBar←FaelleHubHeader, route-tabs←both, *Content←2 routes each). Expect 0-new or an improvement. If knip wants the baseline lowered, `npm run check:knip -- --update-baseline` + diff.
- `check:redirect-stubs`: the 4 hub sub-routes now `return` JSX (no longer pure re-exports) → not redirect stubs. Expect 0-new.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin kitta/faelle-hub-konvergenz-f0
gh pr create --repo aaroncmdo/cmndo --base staging --title "refactor(faelle-hub): F0 Shared Case-Shell (/admin/faelle)" --body "<audit body per AGENTS.md 7-Punkte>"
```
PR body: describe F0 (shared RouteTabBar + FaelleHubHeader + de-re-export 4 tools), the net-zero baseline relocations (with the diff summary), and the deferred F1/F2/F3.

- [ ] **Step 5: Prod-Smoke checklist (Aaron / post-deploy, Test-Accounts only)**

Visit as `smoke-admin`: `/admin/faelle` (Liste), `/admin/faelle/sla`, `/admin/faelle/statistiken`, `/admin/faelle/kanzlei`, `/admin/faelle/reklamationen` — each shows ONE hub header "Fälle" + tabs + the correct active subtitle, no double header, correct content. Then the 4 standalone routes `/admin/sla`, `/admin/statistiken`, `/admin/kanzlei-board`, `/admin/reklamationen` — each renders identically to before (own header + content). Reklamationen badge count matches.

---

## Self-Review

- **Spec coverage:** RouteTabBar (Task 1-2 = spec §3.1), FaelleHubHeader + subtitle (Task 3 = §3.2 + Aaron's per-tab-subtitle choice), layout swap + FaelleKanban title (Task 4 = §3.3 + §3.5 verify), 4 tool de-re-exports (Tasks 5-8 = §3.4), delete FaelleHubTabs (Task 4 = §8), verification/ratchets (Task 9 = §6). All spec sections covered.
- **Placeholders:** none — moves are exact (line ranges + wrapper diffs shown), new files are full code.
- **Type consistency:** `RouteTab`/`isRouteTabActive` signatures identical across Tasks 1-3; `embedded?: boolean` consistent across Tasks 7-8; Content default-exports named exactly as imported in the route files.
- **Deferred (non-goals):** F1 board convergence, F2 redirects/route-dedup, F3 /admin disentangle, KB `mitarbeiter/faelle` — explicitly out of F0.
