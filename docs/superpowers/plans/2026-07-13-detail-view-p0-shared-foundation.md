# Detail-View P0 — Shared Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die zwei bewährten Detail-View-Muster (SV-Intercepting-Drawer + FallakteShell-Chrome) als wiederverwendbare Primitives extrahieren, damit ab P1 jede Entity-Detail-View aus EINEM Muster gebaut wird.

**Architecture:** Zwei neue Shared-Komponenten unter `src/components/shared/detail/`. `DrawerShell` = reiner Move der bewährten SV-Komponente (3 Konsumenten sofort). `EntityDetailShell` = NEUES **Server**-Component-Chrome (Header + `<Link>`-Tabs + Content ‖ optionale Sidebar), das `PageHeader` komponiert. Bewusst Server + Link-Tabs (nicht Client-State wie `FallakteTabs`), weil die konsumierende Server-Page dadurch **nur die Daten des aktiven Tabs** laden kann — genau das Muster von `admin/sachverstaendige/[id]`. Beweis der Abstraktion: die SV-Detail-Page wird erster Konsument, **visuell net-zero**.

**Tech Stack:** Next.js 15 App Router (Server Components, Parallel/Intercepting Routes), React 19, TypeScript, Tailwind v4 (Claimondo-Tokens), Vitest (`environment: 'node'`).

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/detail-view-konsistenz` (existiert, off `staging`), PR → `staging`. **Nie direkt `main`.**
- **Regel 2:** DDL nur via Supabase-Plugin. **P0 hat 0 DDL** — wenn du DDL brauchst, ist etwas falsch.
- **Regel 3:** Kein unbegleiteter Stash am Session-Ende.
- **Regel 4:** Prod-Playwright-Smoke nach Deploy (Task 3 betrifft eine Live-Admin-Route).
- **Umlaute:** Alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`. (Kommentare/Commits dürfen ASCII sein.)
- **Komponenten-Set:** Neue Komponenten nutzen `primitives/*` + `shared/*`. Keine handgerollten Buttons/Cards.
- **Token/Ratchets:** Keine raw Hex, keine Tailwind-Default-Radien (nur `rounded-ios-*`), keine raw Status-Scales (`bg-danger` statt `bg-red-500`). Alle Ratchets müssen 0-neu bleiben.
- **Cross-Lane:** `PageHeader` wird **nur konsumiert, nie modifiziert** (Session `7ca8e37c` = portal-header-phase2 besitzt es). P0 ändert **kein** Header-Aussehen.
- **Verify-Rezept (jede Task):** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` · `npx vitest run <file>` · Ratchets.

---

## File Structure

**Create:**
- `src/components/shared/detail/EntityDetailShell.tsx` — Server-Chrome: Header + Link-Tabs + Content ‖ Sidebar. Einzige Verantwortung: Layout/Chrome. **Kein** Daten-Load.
- `src/components/shared/detail/EntityDetailShell.test.tsx` — Rendering-Contract (renderToStaticMarkup).
- `src/components/shared/detail/DrawerShell.tsx` — Drawer-Hülle für Intercepting-Routes (Move).
- `src/components/shared/detail/index.ts` — Barrel.
- `docs/superpowers/detail-view-recipe.md` — Rezept: 4-File-Intercept-Skelett + Facade-Konvention.

**Modify:**
- `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx` — Import auf Shared.
- `src/app/admin/sachverstaendige/@drawer/(.)anlegen/page.tsx` — Import auf Shared.
- `src/app/admin/sachverstaendige/@drawer/(.)leads/page.tsx` — Import auf Shared.
- `src/app/admin/sachverstaendige/[id]/page.tsx` — Chrome → `EntityDetailShell` (Erst-Konsument).

**Delete:**
- `src/app/admin/sachverstaendige/@drawer/DrawerShell.tsx` — ersetzt durch Shared.

---

## Task 1: EntityDetailShell (Server-Chrome)

**Files:**
- Create: `src/components/shared/detail/EntityDetailShell.tsx`
- Create: `src/components/shared/detail/EntityDetailShell.test.tsx`
- Create: `src/components/shared/detail/index.ts`

**Interfaces:**
- Consumes: `PageHeader` (default export, `@/components/shared/PageHeader`) — Props `{ title: string; description?: ReactNode; actions?: ReactNode }`.
- Produces: `EntityDetailShell` (default export) + `type DetailTab = { key: string; label: string; href: string; badgeCount?: number }` + `type EntityDetailShellProps`. Task 3 und alle P1-Entities konsumieren genau diese Namen.

- [ ] **Step 1: Write the failing test**

Create `src/components/shared/detail/EntityDetailShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'

// Repo-Idiom (siehe FaelleHubHeader.test.tsx): vitest laeuft environment:'node',
// es gibt KEIN jsdom/RTL. Server-Components werden via renderToStaticMarkup
// gerendert; next/link wird auf ein <a> gemockt.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, ...rest }, children as never)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import EntityDetailShell, { type DetailTab } from './EntityDetailShell'

const TABS: DetailTab[] = [
  { key: 'stammdaten', label: 'Stammdaten', href: '/admin/organisationen/o1' },
  { key: 'faelle', label: 'Fälle', href: '/admin/organisationen/o1?tab=faelle', badgeCount: 3 },
]

type Props = React.ComponentProps<typeof EntityDetailShell>

function render(props: Partial<Props> = {}) {
  return renderToStaticMarkup(
    React.createElement(EntityDetailShell, {
      title: 'Muster GmbH',
      children: React.createElement('p', null, 'INHALT'),
      ...props,
    } as Props),
  )
}

describe('EntityDetailShell', () => {
  it('rendert Titel und Content', () => {
    const html = render()
    expect(html).toContain('Muster GmbH')
    expect(html).toContain('INHALT')
  })

  it('rendert Tabs als Links und markiert den aktiven Tab', () => {
    const html = render({ tabs: TABS, activeTab: 'faelle' })
    expect(html).toContain('href="/admin/organisationen/o1?tab=faelle"')
    expect(html).toContain('Stammdaten')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>3<')
  })

  it('rendert keine Tab-Nav wenn tabs fehlen', () => {
    const html = render()
    expect(html).not.toContain('Detail-Tabs')
  })

  it('zeigt den Zurueck-Link in variant=page', () => {
    const html = render({ backHref: '/admin/organisationen', backLabel: 'Organisationen' })
    expect(html).toContain('href="/admin/organisationen"')
    expect(html).toContain('Organisationen')
  })

  it('unterdrueckt den Zurueck-Link in variant=drawer', () => {
    const html = render({
      backHref: '/admin/organisationen',
      backLabel: 'Organisationen',
      variant: 'drawer',
    })
    expect(html).not.toContain('href="/admin/organisationen"')
  })

  it('rendert die Sidebar nur wenn uebergeben', () => {
    expect(render({ sidebar: React.createElement('div', null, 'SIDEBAR') })).toContain('SIDEBAR')
    expect(render()).not.toContain('SIDEBAR')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/detail/EntityDetailShell.test.tsx`
Expected: FAIL — `Failed to resolve import "./EntityDetailShell"` (Datei existiert noch nicht).

- [ ] **Step 3: Write the implementation**

Create `src/components/shared/detail/EntityDetailShell.tsx`:

```tsx
// P0 (Detail-View-Konsistenz): Geteiltes Chrome fuer Entity-Detail-Views.
// Verallgemeinert das Skelett von admin/sachverstaendige/[id] (Gold-Standard):
// Back-Link + PageHeader + Tab-Bar + Content mit optionaler Related-Sidebar.
//
// SERVER-Component MIT ABSICHT: die Tabs sind <Link>s (?tab=), kein Client-State.
// Dadurch kann die konsumierende Server-Page NUR die Daten des aktiven Tabs laden
// (siehe SV-Detail: Verifizierungs-Daten werden nur bei tab=verifizierung geladen).
// FallakteTabs (client, onTabChange, <button>) bleibt fuer die Fallakte-Shells —
// anderes Paradigma, bewusst getrennt.
//
// Chrome ist bewusst 1:1 das heutige SV-Detail-Chrome (sticky weisse Leiste +
// PageHeader + separate Tab-Zeile) => der SV-Refactor ist visuell net-zero.
// Header-Harmonisierung (Card vs. Leiste) gehoert der portal-header-Lane.

import Link from 'next/link'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'

export type DetailTab = {
  /** Stabiler Key — wird gegen activeTab verglichen. */
  key: string
  label: string
  /** Vollstaendige Ziel-URL. Der Caller baut sie (funktioniert in Page UND Drawer). */
  href: string
  /** Optionaler Zaehler am Tab. */
  badgeCount?: number
}

export type EntityDetailShellProps = {
  title: string
  /** Meta-Zeile unter dem Titel (Badges, Email, Paket …). */
  description?: ReactNode
  /** Aktionen rechts im Header (Toggles, Dropdowns, Buttons). */
  actions?: ReactNode
  /** Zurueck-Link zur Liste. Nur in variant="page". */
  backHref?: string
  backLabel?: string
  /** Weglassen => keine Tab-Bar (Single-View-Entities). */
  tabs?: readonly DetailTab[]
  activeTab?: string
  /** Optionale rechte Spalte (verwandte Entities: Faelle, Tasks …). */
  sidebar?: ReactNode
  /**
   * "page"   = Full-Page (sticky Header + Back-Link).
   * "drawer" = im DrawerShell gerendert — kein Back-Link, nicht sticky
   *            (der Drawer hat bereits Titelzeile + Close-Button).
   */
  variant?: 'page' | 'drawer'
  children: ReactNode
}

export default function EntityDetailShell({
  title,
  description,
  actions,
  backHref,
  backLabel = 'Übersicht',
  tabs,
  activeTab,
  sidebar,
  variant = 'page',
  children,
}: EntityDetailShellProps) {
  const isDrawer = variant === 'drawer'
  const showBack = !isDrawer && Boolean(backHref)
  const hasTabs = Boolean(tabs && tabs.length > 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className={`bg-white border-b border-claimondo-border shrink-0 px-4 py-3 ${
          isDrawer ? '' : 'sticky top-0 z-20'
        }`}
      >
        {showBack ? (
          <Link
            href={backHref as string}
            className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors mb-1.5 inline-block"
          >
            &larr; {backLabel}
          </Link>
        ) : null}
        <PageHeader title={title} description={description} actions={actions} />
      </div>

      {/* Tab-Bar (nur wenn Tabs) */}
      {hasTabs ? (
        <nav
          aria-label="Detail-Tabs"
          className="border-b border-claimondo-border bg-white shrink-0 px-4"
        >
          <div className="flex items-center gap-1 overflow-x-auto py-1.5">
            {tabs!.map((tab) => {
              const active = tab.key === activeTab
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2 px-3.5 py-2 text-sm rounded-ios-lg transition-all whitespace-nowrap ${
                    active
                      ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                      : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                  }`}
                >
                  {tab.label}
                  {tab.badgeCount && tab.badgeCount > 0 ? (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-danger rounded-full">
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </nav>
      ) : null}

      {/* Content ‖ optionale Sidebar */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex min-w-0">
          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
          {sidebar ? (
            <aside className="w-[340px] shrink-0 border-l border-claimondo-border overflow-y-auto bg-claimondo-bg/30">
              {sidebar}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}
```

Create `src/components/shared/detail/index.ts`:

```ts
export { default as EntityDetailShell } from './EntityDetailShell'
export type { DetailTab, EntityDetailShellProps } from './EntityDetailShell'
export { default as DrawerShell } from './DrawerShell'
```

> ⚠ `index.ts` re-exportiert `./DrawerShell` — die Datei entsteht erst in Task 2. Lege in Task 1 den Barrel **ohne** die DrawerShell-Zeile an und ergänze sie in Task 2 (sonst bricht `tsc`).
> Task-1-Barrel:
> ```ts
> export { default as EntityDetailShell } from './EntityDetailShell'
> export type { DetailTab, EntityDetailShellProps } from './EntityDetailShell'
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/detail/EntityDetailShell.test.tsx`
Expected: PASS — 6 passed.

- [ ] **Step 5: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler (bekanntes Worktree-Modul-Rauschen ignorieren).

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/detail/
git commit -F - <<'EOF'
feat(detail-view): EntityDetailShell — geteiltes Server-Chrome fuer Detail-Views

Verallgemeinert das SV-Detail-Chrome (Back-Link + PageHeader + Link-Tabs +
Content/Sidebar) als wiederverwendbares Server-Component. Link-Tabs statt
Client-State, damit Consumer pro Tab nur die aktiven Daten laden.
6 Rendering-Contract-Tests (renderToStaticMarkup, Repo-Idiom).

Audit:
- Build: tsc gruen; vitest 6/6
- UI: kein Einstiegspunkt (Infrastruktur; erster Konsument = Task 3)
- Redundanz: komponiert PageHeader; FallakteTabs bewusst NICHT wiederverwendet
  (client/onTabChange vs. server/Link — anderes Paradigma, im Header dokumentiert)
- Dead-Code: nichts entfernt
- Spec: P0 aus 2026-07-13-detail-view-konsistenz-programm-design.md
- Inkonsistenz: nur Tokens (rounded-ios-lg, bg-danger, claimondo-*), keine Hex
- Regression: neue Datei, 0 Konsumenten -> keine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: DrawerShell nach shared extrahieren (3 Konsumenten sofort)

**Files:**
- Create: `src/components/shared/detail/DrawerShell.tsx`
- Modify: `src/components/shared/detail/index.ts` (DrawerShell-Zeile ergänzen)
- Modify: `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx`
- Modify: `src/app/admin/sachverstaendige/@drawer/(.)anlegen/page.tsx`
- Modify: `src/app/admin/sachverstaendige/@drawer/(.)leads/page.tsx`
- Delete: `src/app/admin/sachverstaendige/@drawer/DrawerShell.tsx`

**Interfaces:**
- Produces: `DrawerShell` (default export aus `@/components/shared/detail`) — Props `{ children: ReactNode; title?: string; width?: number }`. **API unverändert** gegenüber der SV-lokalen Version → reiner Move.

- [ ] **Step 1: Neue Shared-Datei anlegen (Inhalt 1:1 übernommen)**

Create `src/components/shared/detail/DrawerShell.tsx` — Inhalt exakt wie bisher, nur Kommentar-Header angepasst:

```tsx
'use client'

// P0 (Detail-View-Konsistenz): Drawer-Huelle fuer Intercepting-Routes.
// Vorher SV-lokal (admin/sachverstaendige/@drawer/DrawerShell.tsx, AAR-691/AAR-803),
// jetzt geteilt — jede drillbare Liste nutzt dieselbe Huelle.
// Schliesst via ESC / Backdrop / Close-Button ueber router.back().

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'
import { Drawer } from '@/components/primitives/Drawer'

type Props = {
  children: ReactNode
  title?: string
  /** Breite in px ab md+. Default 720. */
  width?: number
}

export default function DrawerShell({ children, title, width = 720 }: Props) {
  const router = useRouter()

  const close = () => router.back()

  // Scroll-Lock auf Body waehrend Drawer offen
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <Drawer
      open
      onClose={close}
      width={width}
      noPadding
      hideCloseButton
      ariaLabel={title ?? 'Details'}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border shrink-0">
          <h2 className="text-sm font-semibold text-claimondo-navy truncate">
            {title ?? 'Details'}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo/70"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </Drawer>
  )
}
```

- [ ] **Step 2: Barrel ergänzen**

Modify `src/components/shared/detail/index.ts` — Zeile anfügen:

```ts
export { default as DrawerShell } from './DrawerShell'
```

- [ ] **Step 3: Alle 3 Intercepts auf den Shared-Import umstellen**

In **jedem** der drei Files die Import-Zeile ersetzen:

```diff
- import DrawerShell from '../DrawerShell'
+ import { DrawerShell } from '@/components/shared/detail'
```

Files:
- `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx`
- `src/app/admin/sachverstaendige/@drawer/(.)anlegen/page.tsx`
- `src/app/admin/sachverstaendige/@drawer/(.)leads/page.tsx`

- [ ] **Step 4: Alte Datei löschen**

```bash
git rm "src/app/admin/sachverstaendige/@drawer/DrawerShell.tsx"
```

- [ ] **Step 5: Verifizieren, dass kein Import ins Leere zeigt**

Run: `grep -rn "from '\.\./DrawerShell'\|from './DrawerShell'" src/app/admin/sachverstaendige/`
Expected: **keine Treffer** (leere Ausgabe).

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/shared/detail src/app/admin/sachverstaendige
git commit -F - <<'EOF'
refactor(detail-view): DrawerShell SV-lokal -> shared/detail (3 Konsumenten)

Reiner Move, API unveraendert. Die 3 SV-Intercepts ((.)[id], (.)anlegen,
(.)leads) importieren jetzt aus @/components/shared/detail. Damit ist die
Drawer-Huelle fuer jede kuenftige drillbare Liste verfuegbar.

Audit:
- Build: tsc gruen
- UI: unveraendert (identische Komponente, identische Props)
- Redundanz: beseitigt — 1 geteilte Huelle statt SV-lokaler Kopie
- Dead-Code: alte @drawer/DrawerShell.tsx geloescht; grep: 0 stale Imports
- Spec: P0 Task 2
- Inkonsistenz: Inhalt 1:1, Tokens unveraendert
- Regression: 3 Konsumenten migriert + tsc gruen; Verhalten identisch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: SV-Detail als Erst-Konsument von EntityDetailShell (visuell net-zero)

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/page.tsx` (Chrome-Teil: sticky Header + Tab-Links + 2-Spalten-Layout)
- Modify: `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx` (`variant="drawer"` durchreichen)

**Interfaces:**
- Consumes: `EntityDetailShell` + `DetailTab` aus `@/components/shared/detail` (Task 1/2).
- Produces: `SvDetailPage` akzeptiert zusätzlich `variant?: 'page' | 'drawer'` (Default `'page'`). Next übergibt der echten Route nur `params`/`searchParams` → `variant` bleibt undefined → `'page'`. Der Intercept ruft die Komponente manuell auf und setzt `variant="drawer"`.

**Kontext für den Implementierer:** `[id]/page.tsx` ist eine grosse Server-Page (~544 Zeilen). **Nur das Chrome wird ersetzt** — der gesamte Daten-Load (SV-Query, CalDAV, Fälle, Tasks, Verifizierungs-Tab-Daten) und der Tab-Inhalt bleiben **unverändert**. Das heutige Chrome ist:
`<div h-full flex flex-col>` → sticky Header (`<Link>` zurück + `<PageHeader>`) → Tab-Zeile (2 `<Link>`) → Tab-Content (verifizierung: zentriert; stammdaten: 2-Spalten mit 340px-Panel rechts).

- [ ] **Step 1: Chrome durch EntityDetailShell ersetzen**

Import ergänzen:

```tsx
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
```

Signatur erweitern (Default `'page'`):

```tsx
export default async function SvDetailPage({
  params,
  searchParams,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SvSearchParams>
  variant?: 'page' | 'drawer'
}) {
```

Tabs definieren (nach `const activeTab = …`):

```tsx
const tabs: DetailTab[] = [
  { key: 'stammdaten', label: 'Stammdaten', href: `/admin/sachverstaendige/${id}` },
  { key: 'verifizierung', label: 'Verifizierung', href: `/admin/sachverstaendige/${id}?tab=verifizierung` },
]
```

Den kompletten `return (...)`-Block ersetzen. Die bisherigen JSX-Inhalte werden **unverändert** in die Slots gehoben:
- `title` ← `name || 'Sachverständiger'`
- `description` ← der bisherige `<span className="flex items-center gap-3 flex-wrap">…</span>`-Block (Email/Typ/Paket/Partner-seit/Werbebudget/Urlaub) **1:1**
- `actions` ← der bisherige `actions={<>…</>}`-Inhalt (Auslastung, Onboarding-Badge, VerifizierungsToggle, Mängel, Aktiv/Inaktiv) **1:1**
- `sidebar` ← das bisherige rechte Panel („Offene Fälle" + „Offene Tasks") — **nur im Stammdaten-Tab** (heute existiert es auch nur dort)
- `children` ← der jeweilige Tab-Inhalt

```tsx
return (
  <EntityDetailShell
    variant={variant}
    title={name || 'Sachverständiger'}
    backHref="/admin/sachverstaendige"
    backLabel="Gutachter-Übersicht"
    tabs={tabs}
    activeTab={activeTab}
    description={/* … bisheriger Badges-<span> unveraendert … */}
    actions={/* … bisheriger actions-Fragment unveraendert … */}
    sidebar={
      activeTab === 'stammdaten' ? (
        <div className="space-y-4 p-4">
          {/* … bisheriges "Offene Faelle" + "Offene Tasks"-Panel unveraendert … */}
        </div>
      ) : undefined
    }
  >
    {activeTab === 'verifizierung' ? (
      <div className="p-4 bg-claimondo-bg/30 h-full">
        <div className="max-w-4xl mx-auto">
          {/* … loadError-Banner + <VerifizierungsTab …/> unveraendert … */}
        </div>
      </div>
    ) : (
      <div className="p-4 space-y-5 max-w-6xl mx-auto">
        {/* … CalDAV-Banner + Auslastungs-Card + <SvDetailClient …/> unveraendert … */}
      </div>
    )}
  </EntityDetailShell>
)
```

> **Wichtig:** Die alte äussere Struktur (`sticky top-0` Header-Div, die 2 Tab-`<Link>`s, der `flex`-Wrapper mit `w-[340px]`-Aside) wird **gelöscht** — genau das liefert jetzt die Shell. Der Inhalt der Slots bleibt Zeichen für Zeichen gleich.

- [ ] **Step 2: Intercept auf variant="drawer" umstellen**

Modify `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx`:

```tsx
return (
  <DrawerShell title="Sachverständigen-Profil" width={860}>
    <SvDetailPage params={params} searchParams={searchParams} variant="drawer" />
  </DrawerShell>
)
```

Das `<div className="px-6 py-6">`-Wrapper-Div kann entfallen — die Shell bringt ihr eigenes Padding mit.

- [ ] **Step 3: Typecheck + Tests**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler.

Run: `npx vitest run src/components/shared/detail/`
Expected: PASS (6/6).

- [ ] **Step 4: Ratchets**

Run:
```bash
npm run check:component-set -- --ratchet
npm run check:token-audit
npm run check:knip -- --ratchet
npm run check:status-registry -- --ratchet
```
Expected: alle 0-neu. (`knip`: die alte `@drawer/DrawerShell.tsx` ist weg, die neuen Shared-Files haben Konsumenten → kein neues Dead-File.)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sachverstaendige
git commit -F - <<'EOF'
refactor(detail-view): SV-Detail auf EntityDetailShell (Erst-Konsument, net-zero)

Das handgerollte Chrome (sticky Header + 2 Tab-Links + 2-Spalten-Layout) der
SV-Detail-Page wird durch das geteilte EntityDetailShell ersetzt. Daten-Load und
Tab-Inhalte bleiben unveraendert. Im Drawer (Intercept) laeuft die Page jetzt mit
variant="drawer" -> kein Zurueck-Link mehr im Drawer (der hat Close), Full-Page
per Deep-Link unveraendert.

Audit:
- Build: tsc gruen; vitest 6/6; CI-Build (Route beruehrt) muss gruen sein
- UI: identischer Einstiegspunkt (Liste -> Drawer / Deep-Link -> Full-Page)
- Redundanz: handgerolltes Chrome entfernt -> shared EntityDetailShell
- Dead-Code: alte Header/Tab/Layout-Divs geloescht
- Spec: P0 Task 3 (Beweis der Abstraktion)
- Inkonsistenz: Slot-Inhalte 1:1 uebernommen, Tokens unveraendert
- Regression: Prod-Smoke Pflicht (Regel 4) — siehe Task 4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Prod-Smoke (Regel 4 — Pflicht, Route ist live)**

Nach Deploy auf Prod, mit **Test-Account** (`telefon = NULL`):

```bash
PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/ --grep sachverstaendige
```

Manuell zu prüfen (Admin-Login):
1. `/admin/sachverstaendige` → Klick auf einen SV-Pin/Zeile → **Drawer** öffnet, zeigt Profil, **kein** Zurück-Link, Close funktioniert.
2. Deep-Link `/admin/sachverstaendige/<uuid>` direkt aufrufen → **Full-Page** mit Zurück-Link „Gutachter-Übersicht".
3. Tab „Verifizierung" klicken → URL `?tab=verifizierung`, Inhalt lädt, Tab aktiv markiert.
4. Zurück auf „Stammdaten" → rechtes Panel „Offene Fälle / Offene Tasks" wieder da.

Ergebnis (grün/rot + Screenshot) im PR dokumentieren. **Rot → Fix nachziehen, nicht als erledigt markieren.**

---

## Task 4: Rezept-Doku (die Konvention, auf die P1 aufsetzt)

**Files:**
- Create: `docs/superpowers/detail-view-recipe.md`

- [ ] **Step 1: Rezept schreiben**

Create `docs/superpowers/detail-view-recipe.md`:

````markdown
# Detail-View-Rezept (ab P0 verbindlich)

Jede drillbare Entity-Liste bekommt eine Detail-View nach **diesem** Muster.
Kein Modal-als-Detail mehr, kein handgerolltes Chrome.

## Das 4-File-Skelett

Für eine Liste unter `src/app/<bereich>/<liste>/`:

```
<liste>/layout.tsx                → Parallel-Slot { children, drawer }
<liste>/[id]/page.tsx             → EntityDetailShell (Full-Page = Deep-Link-Ziel)
<liste>/@drawer/(.)[id]/page.tsx  → re-importiert [id]/page in <DrawerShell>
<liste>/@drawer/default.tsx       → return null
```

**layout.tsx**
```tsx
import type { ReactNode } from 'react'

export default function Layout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return <div className="h-full">{children}{drawer}</div>
}
```

**@drawer/default.tsx**
```tsx
export default function DrawerDefault() { return null }
```

**@drawer/(.)[id]/page.tsx**
```tsx
import DetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string }> }) {
  return (
    <DrawerShell title="Organisation" width={860}>
      <DetailPage params={params} searchParams={searchParams} variant="drawer" />
    </DrawerShell>
  )
}
```

**[id]/page.tsx** — Server-Component, lädt Daten, rendert die Shell:
```tsx
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'

export default async function DetailPage({
  params, searchParams, variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const tab = (await searchParams)?.tab ?? 'stammdaten'

  const detail = await getOrganisationDetail(id)   // Facade, s.u.
  if (!detail.ok) notFound()

  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: `/admin/organisationen/${id}` },
    { key: 'faelle', label: 'Fälle', href: `/admin/organisationen/${id}?tab=faelle` },
  ]

  return (
    <EntityDetailShell
      variant={variant}
      title={detail.data.name}
      backHref="/admin/organisationen"
      backLabel="Organisationen"
      tabs={tabs}
      activeTab={tab}
      sidebar={tab === 'stammdaten' ? <RelatedPanel … /> : undefined}
    >
      {tab === 'faelle' ? <FaelleTab … /> : <StammdatenTab … />}
    </EntityDetailShell>
  )
}
```

**Warum Link-Tabs (kein Client-State):** die Page ist eine Server-Component — pro Tab
werden **nur die Daten des aktiven Tabs** geladen (Vorbild `admin/sachverstaendige/[id]`:
die Verifizierungs-Daten werden nur bei `tab=verifizierung` gequeryt). `FallakteTabs`
(client, `onTabChange`) bleibt den Fallakte-Shells vorbehalten — anderes Paradigma.

## Facade-Konvention

Pro Entität **ein** Detail-Loader in `src/lib/<domain>/`:

```ts
export async function getOrganisationDetail(
  id: string,
): Promise<{ ok: true; data: OrganisationDetail } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('organisationen').select('…').eq('id', id).single()
  if (error) return { ok: false, error: error.message }
  // Nested-FK IMMER normalisieren (Array oder Objekt je nach Cardinality):
  const profil = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
  return { ok: true, data: { …data, profil } }
}
```

- Result-Object, **kein** `throw` (AGENTS.md §Server-Actions).
- Nested-FKs mit `Array.isArray(x) ? x[0] : x` normalisieren.
- Mutierende Server-Actions: `revalidatePath('/admin/<liste>')` **und** `revalidatePath('/admin/<liste>/<id>')`.

## Regeln

1. **Listen-Zeile → `<base>/[id]`** (Link/Intercept). Kein Modal-als-Detail für Entitäten mit Related-Daten oder >~8 Feldern.
2. **Kein toter Detail-Link** — die Ziel-Route muss existieren.
3. **Tabs nur wenn die Entität >1 Daten-Konzept hat** — sonst `tabs` weglassen (Single-View).
4. **Header nie selbst bauen** — `EntityDetailShell` liefert ihn (er komponiert `PageHeader`).
````

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/detail-view-recipe.md
git commit -F - <<'EOF'
docs(detail-view): Rezept — 4-File-Intercept-Skelett + Facade-Konvention

Die Konvention, auf die P1 (neue Admin-Detailviews) aufsetzt.

Audit:
- Build: n/a (docs-only)
- UI: n/a
- Redundanz: n/a
- Dead-Code: n/a
- Spec: P0 Task 4
- Inkonsistenz: n/a
- Regression: n/a

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Abschluss (nach Task 4)

- [ ] **PR öffnen gegen `staging`** (Regel 1):
```bash
git push -u origin kitta/detail-view-konsistenz
gh pr create --base staging --title "P0: Detail-View Shared Foundation (EntityDetailShell + DrawerShell)" --body "…"
```
- [ ] **CI-Build muss grün sein** (Route berührt → Next-15-Validator; lokal nicht baubar).
- [ ] **Prod-Smoke** aus Task 3 Step 6 nach Deploy — Ergebnis im PR dokumentieren (Regel 4).
- [ ] Marker `COORDINATION-detail-view-konsistenz-programm` aktualisieren (P0 fertig → P1 startklar).

---

## Self-Review (durchgeführt)

**1. Spec-Coverage (gegen `2026-07-13-detail-view-konsistenz-programm-design.md` §3):**
- §3.1 `EntityDetailShell` → Task 1 ✅
- §3.2 `DrawerShell` extrahiert → Task 2 ✅
- §3.3 Intercepting-Rezept → Task 4 ✅
- §3.4 Facade-Konvention → Task 4 (Rezept-Doku) ✅
- §3.5 Konventionen (kein Modal-als-Detail, kein toter Link, Tabs optional) → Task 4 ✅
- §3.7 Grenze `EntityDetailShell` ↔ `FallakteShell` → **entschieden**: getrennt. FallakteShell bleibt client/state (Claim-Provider); EntityDetailShell ist server/Link. Begründung im Datei-Header (Task 1) + Rezept.
- P0-DoD „SV als Erst-Konsument, net-zero" → Task 3 ✅

**2. Placeholder-Scan:** Keine TBD/TODO. Die `/* … unveraendert … */`-Marker in Task 3 sind **bewusst** — sie verweisen auf existierenden Code, der Zeichen-für-Zeichen umzuhängen ist (ihn hier zu duplizieren würde 200 Zeilen Bestandscode in den Plan kopieren und Drift riskieren). Die exakte Quelle ist benannt (`[id]/page.tsx`, Header/Tab/Layout-Block).

**3. Typ-Konsistenz:** `DetailTab` / `EntityDetailShellProps` / `variant: 'page' | 'drawer'` / `DrawerShell{children,title,width}` — in Task 1/2 definiert, in Task 3/4 identisch verwendet. Barrel-Reihenfolge-Falle (DrawerShell erst in Task 2) ist in Task 1 Step 3 explizit adressiert.

**Offen (bewusst, gehört nicht in P0):** Header-Optik-Harmonisierung (PageHeader-Card vs. weisse Leiste) — gehört der portal-header-Lane (`7ca8e37c`). P0 ist visuell net-zero.
