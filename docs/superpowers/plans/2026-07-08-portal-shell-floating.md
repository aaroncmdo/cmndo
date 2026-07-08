# PortalShell — Freischwebende Shell + Mobile-Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Rollen-Portale bekommen die freischwebende SV-Optik (Navy-Canvas + schwebende Content-Card + Glass-Pills) plus eine klare Mobile-Nav-Linie (Seiten-Drawer fuer admin/dispatch/KB, Bottom-Bar fuer makler/kunde), ueber EINE geteilte `PortalShell`-Komponente.

**Architecture:** Neue praesentationale Client-Komponente `src/components/shared/portal-shell/PortalShell.tsx` besitzt den vollen Rahmen (Canvas + Card + Content-Offset + Mobile-Chrome + Drawer-State). Die Breakpoint-korrekte Klassen-Logik lebt in einem reinen, unit-getesteten Helper `classes.ts`. Die Sidebar (`PortalNav` / bespoke Kunde-Aside) kommt als Slot rein; fuer den Mobile-Drawer rendert `PortalNav` via Context als Panel. Layouts adoptieren PortalShell statt handgerolltem `md:ml-56`-Flush-Layout. `GutachterShell` bleibt Referenz (unangetastet).

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (`@theme` tokens, `rounded-ios-*`, `var(--brand-*)`), vitest (env=node), lucide-react, `cn` (clsx+tailwind-merge).

**Spec:** `docs/superpowers/specs/2026-07-08-portal-shell-floating-composition-design.md`

## Global Constraints

- **Branch/Worktree:** `kitta/portal-shell-floating` (Base `origin/staging`), Worktree `.claude/worktrees/portal-shell-floating/`. NIE direkt auf `main`/`staging` pushen; PR gegen `staging`.
- **Canvas-Farbe:** immer `[bp]:bg-[var(--brand-primary)]` — **kein** Inline-Hex `#0D1B3E` in className (Token-Audit-Ratchet blockt bracket-hex). Default ist global gemappt.
- **Radius:** `rounded-l-ios-xl` (32px, ios-Skala) — NIE `rounded-l-2xl` (Radii-Ratchet). Side+ios-Variante ist im Repo bereits in Nutzung → generiert.
- **Umlaute:** alle user-sichtbaren Strings (aria-labels „Menü öffnen"/„Menü schließen") mit echten Umlauten.
- **PortalNav-Aenderung additiv:** Context-Default (`inShellDrawer:false`) MUSS heutiges Verhalten 1:1 erhalten → 0 Impact auf bestehende Caller ohne Provider.
- **Tests:** vitest `environment: 'node'`, KEIN `@testing-library/react`/jsdom. Nur reine Funktionen/Helper werden unit-getestet (Element-Tree-/String-Inspektion, Muster wie `src/components/ui/__tests__/CardLink.test.tsx`). Hook-Komponenten (PortalShell/PortalNav) werden per `npm run build` verifiziert.
- **`cn`:** `import { cn } from '@/lib/utils'`.
- **Ratchets 0-neu:** `check:token-audit`, `check:component-set`, `check:knip`, `check:status-registry`, `check:redirect-stubs`.
- **Commit-Format:** 7-Punkte-Audit im Body, Co-Authored-By-Line. Frequent commits (pro Task).

---

## File Structure

**Neu:**
- `src/components/shared/portal-shell/classes.ts` — reiner Klassen-Resolver (Breakpoint → literale Sets). Unit-getestet.
- `src/components/shared/portal-shell/classes.test.ts` — Unit-Tests fuer den Resolver.
- `src/components/shared/portal-shell/context.ts` — `PortalShellDrawerContext` (`inShellDrawer` + `onNavigate`).
- `src/components/shared/portal-shell/PortalShell.tsx` — die Shell-Komponente (`'use client'`, Drawer-State).
- `src/components/shared/portal-shell/index.ts` — Barrel.

**Modifiziert:**
- `src/components/shared/portal-nav/PortalNav.tsx` — additiver Panel-Mode (Context-Read) fuer die dark-Variante.
- `src/app/admin/layout.tsx`, `src/app/dispatch/layout.tsx`, `src/app/kunde/layout.tsx`, `src/app/kanzlei/layout.tsx`, `src/app/mitarbeiter/layout.tsx` — PortalShell-Adoption.
- `src/components/makler/MaklerShell.tsx` — PortalShell-Adoption.
- ggf. `src/app/kanzlei/_components/KanzleiNav.tsx`, `src/app/mitarbeiter/_components/MitarbeiterNav.tsx` — `variant="light"` → `"dark"`.

---

## PHASE 0 — Fundament (PortalShell + PortalNav-Panel-Mode)

### Task 0.1: Reiner Klassen-Resolver `classes.ts` (TDD)

**Files:**
- Create: `src/components/shared/portal-shell/classes.ts`
- Test: `src/components/shared/portal-shell/classes.test.ts`

**Interfaces:**
- Produces: `type PortalShellBreakpoint = 'md' | 'lg'`; `portalShellClasses(bp): { canvas: string; card: string; cardGutter: string; mobileHide: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shared/portal-shell/classes.test.ts
import { describe, it, expect } from 'vitest'
import { portalShellClasses } from './classes'

describe('portalShellClasses', () => {
  it('md: Canvas/Card/Gutter/Hide alle md-praefixiert', () => {
    const c = portalShellClasses('md')
    expect(c.canvas).toBe('md:bg-[var(--brand-primary)]')
    expect(c.card).toContain('md:rounded-l-ios-xl')
    expect(c.card).toContain('md:bg-claimondo-bg')
    expect(c.cardGutter).toBe('md:pl-4 md:pt-4 md:pb-4')
    expect(c.mobileHide).toBe('md:hidden')
  })
  it('lg: alle lg-praefixiert (Kunde/SV-Breakpoint)', () => {
    const c = portalShellClasses('lg')
    expect(c.canvas).toBe('lg:bg-[var(--brand-primary)]')
    expect(c.card).toContain('lg:rounded-l-ios-xl')
    expect(c.cardGutter).toBe('lg:pl-4 lg:pt-4 lg:pb-4')
    expect(c.mobileHide).toBe('lg:hidden')
  })
  it('Canvas ohne Inline-Hex (Token-Audit-safe)', () => {
    expect(portalShellClasses('md').canvas).not.toContain('#')
    expect(portalShellClasses('lg').canvas).not.toContain('#')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/shared/portal-shell/classes.test.ts`
Expected: FAIL — `Failed to resolve import './classes'` / `portalShellClasses is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/shared/portal-shell/classes.ts
// Reiner Klassen-Resolver fuer PortalShell. Getrennt von der Komponente, damit
// die Breakpoint-Logik ohne DOM/Hooks unit-testbar ist (Repo: vitest env=node,
// kein RTL). Tailwind-JIT kann keine dynamischen `${bp}:`-Klassen bauen → beide
// Breakpoints ausgeschrieben (literale Sets).

export type PortalShellBreakpoint = 'md' | 'lg'

const CANVAS: Record<PortalShellBreakpoint, string> = {
  md: 'md:bg-[var(--brand-primary)]',
  lg: 'lg:bg-[var(--brand-primary)]',
}
const CARD: Record<PortalShellBreakpoint, string> = {
  md: 'md:rounded-l-ios-xl md:rounded-r-none md:bg-claimondo-bg md:shadow-sm',
  lg: 'lg:rounded-l-ios-xl lg:rounded-r-none lg:bg-claimondo-bg lg:shadow-sm',
}
const CARD_GUTTER: Record<PortalShellBreakpoint, string> = {
  md: 'md:pl-4 md:pt-4 md:pb-4',
  lg: 'lg:pl-4 lg:pt-4 lg:pb-4',
}
const MOBILE_HIDE: Record<PortalShellBreakpoint, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
}

export function portalShellClasses(breakpoint: PortalShellBreakpoint) {
  return {
    canvas: CANVAS[breakpoint],
    card: CARD[breakpoint],
    cardGutter: CARD_GUTTER[breakpoint],
    mobileHide: MOBILE_HIDE[breakpoint],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/shared/portal-shell/classes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/portal-shell/classes.ts src/components/shared/portal-shell/classes.test.ts
git commit -m "feat(portal-shell): reiner Breakpoint-Klassen-Resolver + Tests"
```

---

### Task 0.2: Drawer-Context `context.ts`

**Files:**
- Create: `src/components/shared/portal-shell/context.ts`

**Interfaces:**
- Produces: `PortalShellDrawerProvider` (Context.Provider); `usePortalShellDrawer(): { inShellDrawer: boolean; onNavigate: () => void }`
- Consumes: nichts.

- [ ] **Step 1: Implement (kein Unit-Test — reiner Context, per Build/tsc verifiziert)**

```ts
// src/components/shared/portal-shell/context.ts
'use client'
import { createContext, useContext } from 'react'

export type PortalShellDrawerContextValue = {
  /** true wenn die Sidebar innerhalb des PortalShell-Mobile-Drawers rendert →
   *  PortalNav rendert dann als Panel (kein self-positioning, kein Bottom-Nav). */
  inShellDrawer: boolean
  /** Schliesst den Drawer (Nav-Item-onClick). No-op ausserhalb des Drawers. */
  onNavigate: () => void
}

const PortalShellDrawerContext = createContext<PortalShellDrawerContextValue>({
  inShellDrawer: false,
  onNavigate: () => {},
})

export const PortalShellDrawerProvider = PortalShellDrawerContext.Provider

export function usePortalShellDrawer(): PortalShellDrawerContextValue {
  return useContext(PortalShellDrawerContext)
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler in `portal-shell/context.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/portal-shell/context.ts
git commit -m "feat(portal-shell): Drawer-Context (inShellDrawer + onNavigate)"
```

---

### Task 0.3: `PortalShell.tsx` + Barrel

**Files:**
- Create: `src/components/shared/portal-shell/PortalShell.tsx`
- Create: `src/components/shared/portal-shell/index.ts`

**Interfaces:**
- Consumes: `portalShellClasses`, `PortalShellBreakpoint` (0.1); `PortalShellDrawerProvider` (0.2); `cn` (`@/lib/utils`); `MenuIcon` (lucide-react).
- Produces: `PortalShell` (named export) + `PortalShellProps`.

- [ ] **Step 1: Implement PortalShell**

```tsx
// src/components/shared/portal-shell/PortalShell.tsx
'use client'

// Geteilter Portal-Rahmen: Desktop Navy-Canvas + schwebende gerundete Content-
// Card + Glass-Pills (via Sidebar-Slot), Mobile-Chrome + optionaler Seiten-
// Drawer. Praesentational; nur der Drawer-Open-State ist Client. Server-Layouts
// reichen server-gerenderte sidebar/children als Props durch (Standard-Pattern).

import { useState } from 'react'
import { MenuIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalShellClasses, type PortalShellBreakpoint } from './classes'
import { PortalShellDrawerProvider } from './context'

export type PortalShellProps = {
  /** Sidebar-Element — PortalNav (dark) oder bespoke Aside (kunde). */
  sidebar: React.ReactNode
  /** Seiteninhalt — wird in die schwebende Card gewrappt. */
  children: React.ReactNode
  /** Desktop-Breakpoint, MUSS zum Sidebar-Breakpoint passen. Default 'md'. */
  breakpoint?: PortalShellBreakpoint
  /** Content-Offset (Sidebar-Breite als linkes Gutter), am SELBEN Breakpoint.
   *  Literal (Tailwind-JIT). Default 'md:pl-56'. */
  contentOffsetClass?: string
  /** 'self' = PortalShell fuegt keine Mobile-Chrome hinzu (Portal managed selbst).
   *  'shell-drawer' = Hamburger + Overlay + Slide-in-Panel (admin/dispatch/KB). */
  mobileNav?: 'self' | 'shell-drawer'
  /** Optionaler Mobile-Header-Inhalt (Logo/Badge/Trailing). Bei 'shell-drawer'
   *  setzt PortalShell den Hamburger links davor. */
  mobileHeader?: React.ReactNode
  /** Optionaler fixed Top-Right-Slot (Desktop) — z.B. UpdatesNav-Pill. */
  desktopTopRight?: React.ReactNode
  /** Zusatzklassen fuer die Content-Card (z.B. 'md:pr-36'). */
  contentClassName?: string
}

export function PortalShell({
  sidebar,
  children,
  breakpoint = 'md',
  contentOffsetClass = 'md:pl-56',
  mobileNav = 'self',
  mobileHeader,
  desktopTopRight,
  contentClassName,
}: PortalShellProps) {
  const [open, setOpen] = useState(false)
  const { canvas, card, cardGutter, mobileHide } = portalShellClasses(breakpoint)
  const isDrawer = mobileNav === 'shell-drawer'

  return (
    <PortalShellDrawerProvider value={{ inShellDrawer: isDrawer, onNavigate: () => setOpen(false) }}>
      <div className={cn('h-screen flex overflow-hidden bg-claimondo-bg', canvas)}>
        {/* Mobile-Overlay (nur Drawer + offen) */}
        {isDrawer && open && (
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setOpen(false)}
            className={cn('fixed inset-0 z-40 bg-black/50', mobileHide)}
          />
        )}

        {/* Sidebar: bei 'self' bare (PortalNav self-positioniert wie heute);
            bei 'shell-drawer' wrappt PortalShell sie in ein positioniertes
            Panel — Desktop statischer Rail, Mobile Off-Canvas-Slide. PortalNav
            rendert dann via Context als Panel (kein eigenes fixed/hidden). */}
        {isDrawer ? (
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-200 ease-out',
              // Mobile solid, Desktop transparent (Glass-Pills via data-sidebar-mode).
              'bg-claimondo-navy',
              breakpoint === 'md' ? 'md:bg-transparent md:translate-x-0' : 'lg:bg-transparent lg:translate-x-0',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {sidebar}
          </div>
        ) : (
          sidebar
        )}

        <div className={cn('flex-1 flex flex-col min-w-0 h-screen', contentOffsetClass)}>
          {(mobileHeader || isDrawer) && (
            <header className={cn('flex items-center gap-3 px-4 py-3 glass-dark shadow-ios-md shrink-0', mobileHide)}>
              {isDrawer && (
                <button
                  type="button"
                  aria-label="Menü öffnen"
                  onClick={() => setOpen(true)}
                  className="text-white p-1 -ml-1"
                >
                  <MenuIcon style={{ width: 22, height: 22 }} />
                </button>
              )}
              {mobileHeader}
            </header>
          )}

          {desktopTopRight}

          <div className={cn('flex-1 overflow-hidden', cardGutter)}>
            <main id="main-content" role="main" className={cn('h-full overflow-y-auto', card, contentClassName)}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </PortalShellDrawerProvider>
  )
}
```

- [ ] **Step 2: Barrel**

```ts
// src/components/shared/portal-shell/index.ts
export { PortalShell, type PortalShellProps } from './PortalShell'
export { usePortalShellDrawer, type PortalShellDrawerContextValue } from './context'
export { portalShellClasses, type PortalShellBreakpoint } from './classes'
```

- [ ] **Step 3: Verify tsc + build**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/portal-shell/PortalShell.tsx src/components/shared/portal-shell/index.ts
git commit -m "feat(portal-shell): PortalShell-Komponente (Canvas + Card + Mobile-Drawer) + Barrel"
```

---

### Task 0.4: `PortalNav` Panel-Mode (additiv, Context-Read)

**Files:**
- Modify: `src/components/shared/portal-nav/PortalNav.tsx`

**Interfaces:**
- Consumes: `usePortalShellDrawer` (0.2).
- Produces: unveraendertes API (kein neuer Prop). Verhalten: mit Provider `inShellDrawer=true` → dark-Aside rendert als Panel (`flex h-full w-full`, kein `hidden md:flex fixed`, kein `mobileItems`-Bottom-Nav), Nav-Items rufen `onNavigate` onClick. Ohne Provider unveraendert.

- [ ] **Step 1: Import Context (oben bei den Imports)**

```tsx
import { usePortalShellDrawer } from '@/components/shared/portal-shell/context'
```

- [ ] **Step 2: Context lesen (in der Komponente, nach `const floatingMode = useFloatingSidebar()`)**

```tsx
  const { inShellDrawer, onNavigate } = usePortalShellDrawer()
```

- [ ] **Step 3: `renderDarkItem` — onNavigate bei Item-Click im Drawer**

Im `renderDarkItem`-Link (der `<Link ... className={cls}>`-Zweig) `onClick` ergaenzen:

```tsx
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cls}
        onClick={inShellDrawer ? onNavigate : undefined}
      >
        <item.icon style={{ width: 17, height: 17 }} />
        <span className="flex-1">{item.label}</span>
        {renderBadge?.(item) ?? null}
      </Link>
    )
```

- [ ] **Step 4: dark-Variante — Panel-Mode am `<aside>` + Bottom-Nav unterdruecken**

Ersetze die `className` des dark-`<aside>` so, dass im Panel-Mode das Self-Positioning entfaellt:

```tsx
        <aside
          role="navigation"
          aria-label={ariaLabel ?? 'Portal-Navigation'}
          data-sidebar-mode={floatingMode ? 'floating' : 'bar'}
          className={cn(
            inShellDrawer
              ? 'flex flex-col h-full w-full' // PortalShell positioniert (Rail/Drawer)
              : 'hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40',
            floatingMode ? 'bg-transparent py-3 px-3 gap-3' : 'bg-claimondo-navy',
            className,
          )}
        >
```

(`cn` ist in PortalNav zu importieren, falls noch nicht: `import { cn } from '@/lib/utils'`.)

Und die Mobile-`mobileItems`-Bottom-Nav nur rendern wenn NICHT im Drawer:

```tsx
        {!inShellDrawer && mobileItems && mobileItems.length > 0 && (
          <nav
            aria-label="Mobile Navigation"
            ...
```

- [ ] **Step 5: Verify — bestehende Caller unveraendert**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler.
Run: `npm run build`
Expected: gruen (admin/dispatch/makler nutzen PortalNav noch ohne Provider → Default-Pfad).

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/portal-nav/PortalNav.tsx
git commit -m "feat(portal-nav): additiver Panel-Mode via PortalShell-Context (Default unveraendert)"
```

---

## PHASE 1 — Desktop Gruppe A (admin, dispatch, makler, kunde)

> Ziel je Portal: Layout-Root + `<main>` → `PortalShell`. `mobileNav='self'` (Mobile bleibt wie heute). Nach jedem Task: `npm run build` gruen + visueller Desktop-Check (Canvas + schwebende Card + Pills).

### Task 1.1: admin adoptiert PortalShell

**Files:**
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `PortalShell` (`@/components/shared/portal-shell`).

- [ ] **Step 1: Import + `return`-Block ersetzen**

Import ergaenzen:
```tsx
import { PortalShell } from '@/components/shared/portal-shell'
```

`return (...)` ersetzen (die Datenladung `meineTasksCount` bleibt unveraendert davor):
```tsx
  return (
    <MitteilungenProvider>
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={<AdminNav email={user.email ?? ''} initials={initials} userId={user.id} meineTasksCount={meineTasksCount ?? 0} />}
        mobileHeader={
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
        }
        desktopTopRight={
          <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
            <OutboxBadge />
            <UpdatesNav variant="light" />
          </div>
        }
        contentClassName="md:pr-36"
      >
        {/* Spotlight bleibt als Ambient im Content-Bereich */}
        <Spotlight />
        <PageContainer className="h-full">{children}</PageContainer>
      </PortalShell>
      <GlobalPosteingangFab currentUserId={user.id} />
    </MitteilungenProvider>
  )
```

Hinweis: der bisherige `<header className="md:hidden ...">` (Mobile) ist nun der `mobileHeader`-Slot; die Atmosphaeren-Spotlight-Divs (`radial-gradient`) entfallen zugunsten des Navy-Canvas (in Phase-1-Review pruefen — falls gewuenscht, als `desktopTopRight`-nebenlaeufiges Ambient wieder rein). `Spotlight` (Cmd+K-Suche) bleibt.

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: gruen.
Visuell (`npm run dev`, /admin am Desktop): Navy-Canvas, weisse gerundete Card links abgerundet, Glass-Pills-Sidebar. Mobile: Bottom-Nav + Header wie zuvor.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): PortalShell-Adoption (freischwebende Desktop-Optik)"
```

---

### Task 1.2: dispatch adoptiert PortalShell

**Files:**
- Modify: `src/app/dispatch/layout.tsx`

- [ ] **Step 1: Import + `return` ersetzen**

```tsx
import { PortalShell } from '@/components/shared/portal-shell'
```
```tsx
  return (
    <MitteilungenProvider>
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={<DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />}
        mobileHeader={
          <>
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield px-2 py-0.5 rounded-ios-sm">Dispatch</span>
              <UpdatesNav variant="dark" />
            </div>
          </>
        }
        desktopTopRight={
          <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
            <UpdatesNav variant="light" />
          </div>
        }
        contentClassName="md:pr-36"
      >
        <RealtimeLeadAlert />
        <PageContainer className="h-full">{children}</PageContainer>
      </PortalShell>
    </MitteilungenProvider>
  )
```

- [ ] **Step 2: Verify**

Run: `npm run build` → gruen. Visuell /dispatch Desktop = freischwebend; Mobile-Header/Bottom-Nav wie zuvor.

- [ ] **Step 3: Commit**

```bash
git add src/app/dispatch/layout.tsx
git commit -m "feat(dispatch): PortalShell-Adoption (freischwebende Desktop-Optik)"
```

---

### Task 1.3: makler adoptiert PortalShell

**Files:**
- Modify: `src/components/makler/MaklerShell.tsx`

- [ ] **Step 1: Import + `return` ersetzen**

```tsx
import { PortalShell } from '@/components/shared/portal-shell'
```

Der `<PortalNav variant="dark" ... />`-Aufruf (mit `sections`/`mobileItems`/`headerSlot`/`footerSlot`) wandert in den `sidebar`-Prop; der bisherige `<div className="... md:ml-56">`-Content-Wrapper + Mobile-Header wird zu PortalShell:

```tsx
  return (
    <MitteilungenProvider>
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={
          <PortalNav
            variant="dark"
            ariaLabel="Makler-Navigation"
            sections={[{ items: MAKLER_NAV_ITEMS }]}
            mobileItems={MAKLER_MOBILE_ITEMS}
            headerSlot={/* unveraenderter headerSlot-Block */ maklerHeaderSlot}
            footerSlot={/* unveraenderter footerSlot-Block */ maklerFooterSlot}
          />
        }
        mobileHeader={
          <>
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <span className="ml-auto rounded bg-claimondo-shield px-2 py-0.5 text-[10px] uppercase tracking-wider text-claimondo-light-blue">Makler</span>
          </>
        }
      >
        {children}
      </PortalShell>
    </MitteilungenProvider>
  )
```

Dazu die bestehenden `headerSlot`/`footerSlot`-JSX-Bloecke in lokale Consts `maklerHeaderSlot`/`maklerFooterSlot` extrahieren (reiner Lesbarkeits-Refactor, gleicher Inhalt). Die Atmosphaeren-Spotlight-Divs entfallen (Navy-Canvas); in Review pruefen.

- [ ] **Step 2: Verify**

Run: `npm run build` → gruen. Visuell /makler Desktop = freischwebend; Mobile Bottom-Nav (PortalNav mobileItems) unveraendert.

- [ ] **Step 3: Commit**

```bash
git add src/components/makler/MaklerShell.tsx
git commit -m "feat(makler): PortalShell-Adoption (freischwebende Desktop-Optik)"
```

---

### Task 1.4: kunde adoptiert PortalShell (breakpoint lg)

**Files:**
- Modify: `src/app/kunde/layout.tsx`

- [ ] **Step 1: Import + Shell-Wrapping**

```tsx
import { PortalShell } from '@/components/shared/portal-shell'
```

Die bestehende `<aside className="kunde-sidebar glass-branded ... lg:w-64 ... fixed ...">…</aside>` wird `sidebar`-Slot; der `<main className="flex-1 lg:ml-64 ...">…</main>` + Mobile-Header + Bottom-Nav wandern in PortalShell. `breakpoint="lg"`, `contentOffsetClass="lg:pl-64"`, `mobileNav="self"` (bestehende Bottom-Nav `<KundeNav mobile/>` + `KundeMobileDrawer` bleiben als Slots/Children):

```tsx
  return (
    <MitteilungenProvider>
      <div style={themeStyle}>
        <PortalShell
          breakpoint="lg"
          contentOffsetClass="lg:pl-64"
          mobileNav="self"
          sidebar={/* unveraenderter <aside className="kunde-sidebar ...">…</aside> */ kundeSidebar}
          mobileHeader={/* unveraenderter Mobile-<header> Inhalt (Logo + LanguageSwitcher + OutboxBadge + UpdatesNav) */ kundeMobileHeader}
        >
          <SprachBanner sprache={kundenSprache} />
          <OrphanMatchBanner userId={user.id} />
          {children}
        </PortalShell>
        {/* Mobile Bottom-Nav bleibt fixed unten (self-managed) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center glass-branded shadow-ios-md"
             style={{ backgroundColor: sidebarBg, paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
          <KundeNav mobile singleFallId={singleRouteId} />
        </nav>
      </div>
    </MitteilungenProvider>
  )
```

Die JSX-Bloecke fuer `<aside class="kunde-sidebar">` und den Mobile-`<header>` in lokale Consts `kundeSidebar`/`kundeMobileHeader` extrahieren (gleicher Inhalt). `themeStyle` (Brand-CSS-Vars) bleibt auf einem Wrapper um PortalShell, damit `var(--brand-primary)` im Canvas das SV-Brand traegt.

Wichtig: `breakpoint="lg"` weil die Kunde-Sidebar erst ab `lg` sichtbar ist (`kunde-sidebar` = `hidden lg:flex`), Content-Offset `lg:pl-64`, Mobile < lg.

- [ ] **Step 2: Verify**

Run: `npm run build` → gruen. Visuell /kunde Desktop (>= lg) = freischwebend, Canvas nimmt Brand des zugewiesenen SV (falls verifiziert+gebrandet) sonst Navy. Mobile < lg: Header + Bottom-Nav + Cards-Drawer unveraendert.

- [ ] **Step 3: Commit**

```bash
git add src/app/kunde/layout.tsx
git commit -m "feat(kunde): PortalShell-Adoption (lg-Breakpoint, Brand-Canvas)"
```

---

### Task 1.5: Phase-1 Verifikations-Gate (Ratchets + Build)

- [ ] **Step 1: Full Build + Ratchets**

```bash
npm run build
npm run test
node scripts/check-token-audit.mjs
node scripts/check-component-set.mjs
node scripts/check-knip.mjs
node scripts/check-redirect-stubs.mjs
node scripts/check-status-registry.mjs
```
Expected: Build gruen; Tests gruen; alle Checks 0-neu (lokal `--warn`, keine neuen Verstoesse).

- [ ] **Step 2: Visuelle Screenshots (optional, dokumentierend)**

Run: `npm run screenshots:dispatch` (+ manuell admin/makler/kunde am Desktop).
Expected: Navy-Canvas + schwebende Card sichtbar.

- [ ] **Step 3: Commit (nur falls Baseline-Updates noetig)**

Falls ein Ratchet einen NEUEN Verstoss meldet: Ursache fixen (nicht Baseline aufblaehen), erneut pruefen, committen.

---

## PHASE 2 — Desktop Gruppe B (kanzlei, mitarbeiter: header-first → sidebar-first)

> Umbau: Top-Bar entfaellt, Light-Nav → dark, PortalShell-Adoption. Eigener Checkpoint + Screenshot vor/nach (groesserer IA-Wechsel).

### Task 2.1: KanzleiNav dark + kanzlei-Layout PortalShell (desktop-only)

**Files:**
- Modify: `src/app/kanzlei/_components/KanzleiNav.tsx` (variant light → dark + header/footer-Slots)
- Modify: `src/app/kanzlei/layout.tsx`

- [ ] **Step 1: KanzleiNav auf dark + Slots**

In `KanzleiNav.tsx`: `variant="light"` → `variant="dark"`. Die bisher im Layout-Top-Bar lebenden Elemente (Logo+Shield-Badge „Kanzlei", TasksPill, UpdatesNav, displayName, Logout) als `headerSlot`/`footerSlot` an `PortalNav` uebergeben (Muster wie MaklerShell). Falls KanzleiNav die Slot-Daten braucht (userId/displayName), diese als Props durchreichen.

```tsx
// KanzleiNav.tsx (Signatur erweitern)
export default function KanzleiNav({ userId, displayName }: { userId: string; displayName: string }) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Kanzlei-Navigation"
      sections={/* bestehende sections */ KANZLEI_SECTIONS}
      headerSlot={
        <>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/claimondo-shield.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <TasksPill userId={userId} href="/kanzlei/mandate" />
          </div>
          <p className="mt-1 inline-block rounded bg-claimondo-shield px-2 py-0.5 text-[10px] uppercase tracking-wider text-claimondo-light-blue">Kanzlei</p>
        </>
      }
      footerSlot={
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <UpdatesNav variant="dark" />
            <span className="min-w-0 flex-1 truncate text-sm text-white/90">{displayName}</span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white">
              <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
```
(Imports `TasksPill`, `UpdatesNav`, `LogOutIcon` in KanzleiNav ergaenzen; ggf. `KANZLEI_SECTIONS` = bestehende `sections`.)

- [ ] **Step 2: kanzlei/layout.tsx → PortalShell**

```tsx
import { PortalShell } from '@/components/shared/portal-shell'
...
  return (
    <MitteilungenProvider>
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={<KanzleiNav userId={user.id} displayName={displayName} />}
        mobileHeader={
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
        }
      >
        {children}
      </PortalShell>
    </MitteilungenProvider>
  )
```
(Der bisherige `<header className="glass-dark ...">`-Top-Bar-Block wird entfernt — seine Inhalte leben jetzt in KanzleiNav-Slots + minimalem mobileHeader.)

- [ ] **Step 3: Verify + Screenshot**

Run: `npm run build` → gruen. Visuell /kanzlei Desktop = Navy-Canvas + Full-Height-Sidebar + Card. Screenshot vor/nach ablegen.

- [ ] **Step 4: Commit**

```bash
git add src/app/kanzlei/_components/KanzleiNav.tsx src/app/kanzlei/layout.tsx
git commit -m "feat(kanzlei): header-first -> sidebar-first, PortalShell-Adoption (desktop-only)"
```

---

### Task 2.2: MitarbeiterNav dark + mitarbeiter-Layout PortalShell (Desktop)

**Files:**
- Modify: `src/app/mitarbeiter/_components/MitarbeiterNav.tsx` (variant light → dark + Slots)
- Modify: `src/app/mitarbeiter/layout.tsx`

- [ ] **Step 1: MitarbeiterNav auf dark + Slots** (analog KanzleiNav; Logo/TasksPill/UpdatesNav/displayName/Logout in header/footer-Slots; `unreadNachrichten`-Badge via `renderBadge` beibehalten falls genutzt).

```tsx
export default function MitarbeiterNav({ userId, displayName, unreadNachrichten }: { userId: string; displayName: string; unreadNachrichten: number }) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Mitarbeiter-Navigation"
      sections={/* bestehende ITEMS als sections */ [{ items: ITEMS }]}
      renderBadge={/* bestehende Badge-Logik fuer unreadNachrichten, falls vorhanden */ undefined}
      headerSlot={
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
          <TasksPill userId={userId} href="/mitarbeiter/tasks" />
        </div>
      }
      footerSlot={
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <UpdatesNav variant="dark" />
            <span className="min-w-0 flex-1 truncate text-sm text-white/90">{displayName}</span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white">
              <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
```

- [ ] **Step 2: mitarbeiter/layout.tsx → PortalShell** (Desktop hier; Mobile-Drawer folgt in Phase 3, daher jetzt `mobileNav="self"` + minimaler mobileHeader)

```tsx
import { PortalShell } from '@/components/shared/portal-shell'
...
  return (
    <MitteilungenProvider>
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={<MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />}
        mobileHeader={
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
        }
      >
        {children}
      </PortalShell>
      <GlobalPosteingangFab currentUserId={user.id} />
    </MitteilungenProvider>
  )
```
(Top-Bar-`<header>` entfernt.)

- [ ] **Step 3: Verify + Screenshot + Commit**

Run: `npm run build` → gruen. Visuell /mitarbeiter Desktop = freischwebend.
```bash
git add src/app/mitarbeiter/_components/MitarbeiterNav.tsx src/app/mitarbeiter/layout.tsx
git commit -m "feat(mitarbeiter): header-first -> sidebar-first, PortalShell-Adoption (Desktop)"
```

---

## PHASE 3 — Mobile-Seiten-Drawer (admin, dispatch, mitarbeiter/KB)

> `mobileNav='self'` → `'shell-drawer'`; PortalNav rendert im Panel-Mode (Context aus Phase 0.4); die bisherige `mobileItems`-Bottom-Bar bei admin/dispatch entfaellt (Drawer ersetzt sie). makler/kunde/SV/kanzlei unangetastet.

### Task 3.1: admin Mobile-Drawer

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: `mobileNav` umstellen**

In `src/app/admin/layout.tsx` am `<PortalShell>`: `mobileNav="self"` → `mobileNav="shell-drawer"`. Der `mobileHeader` bleibt (Logo); PortalShell setzt den Hamburger automatisch davor. `AdminNav` liefert `sections` an PortalNav → im Drawer sichtbar. Falls `AdminNav` `mobileItems` an PortalNav uebergibt: unveraendert lassen (Panel-Mode unterdrueckt die Bottom-Bar via `!inShellDrawer`).

- [ ] **Step 2: Verify**

Run: `npm run build` → gruen. Visuell /admin Mobile (< md): Hamburger oben links → Drawer slidet von links mit voller Nav; Navigation schliesst Drawer. Keine Bottom-Bar mehr.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): Mobile-Seiten-Drawer statt Bottom-Bar"
```

### Task 3.2: dispatch Mobile-Drawer

**Files:**
- Modify: `src/app/dispatch/layout.tsx`

- [ ] **Step 1:** `mobileNav="self"` → `mobileNav="shell-drawer"` (analog 3.1; `mobileHeader` mit Dispatch-Badge bleibt).
- [ ] **Step 2:** `npm run build` → gruen; Visuell /dispatch Mobile = Drawer.
- [ ] **Step 3:** Commit `feat(dispatch): Mobile-Seiten-Drawer statt Bottom-Bar`

### Task 3.3: mitarbeiter/KB Mobile-Drawer

**Files:**
- Modify: `src/app/mitarbeiter/layout.tsx`

- [ ] **Step 1:** `mobileNav="self"` → `mobileNav="shell-drawer"` (KB bekommt erstmals echte Mobile-Nav).
- [ ] **Step 2:** `npm run build` → gruen; Visuell /mitarbeiter Mobile = Hamburger → Drawer.
- [ ] **Step 3:** Commit `feat(mitarbeiter): Mobile-Seiten-Drawer (erste echte KB-Mobile-Nav)`

### Task 3.4: Phase-3 Verifikations-Gate

- [ ] **Step 1:** `npm run build` + `npm run test` + alle 5 Ratchet-Scripts → gruen / 0-neu.
- [ ] **Step 2:** Mobile-Smoke (DevTools Responsive, 390px): admin/dispatch/KB = Drawer; makler/kunde = Bottom unveraendert; SV = Cockpit; kanzlei = kein Drawer (minimaler Header).
- [ ] **Step 3:** Werkstatt-Handoff-Marker aktualisieren (Memory `coordination-portal-shell-floating`): PortalShell steht, werkstatt-Sessions koennen `mobileNav='self'` adoptieren.

---

## Self-Review (durchgefuehrt beim Schreiben)

**Spec-Coverage:** Desktop-Optik (§3.1) → Phase 0 + Phase 1/2. Mobile-Strategie (§3.2) → Phase 0.4 (Panel-Mode) + Phase 3 (Drawer) + `mobileNav='self'` (makler/kunde/kanzlei unveraendert) + SV out-of-scope. Breakpoint-Korrektheit (§4.3) → Task 0.1 Helper + Tests + `breakpoint`/`contentOffsetClass`-Props je Portal. Compliance-Fallen (§4.4) → Global Constraints + Task-0.1-Test „kein Inline-Hex". Koexistenz (§4.5) → PortalNav-Default unveraendert (Task 0.4). Drawer-Mechanik (§4.6) → Task 0.2/0.4 + PortalShell-Wrapper.

**Placeholder-Scan:** Zwei Stellen nutzen bewusst benannte Extraktions-Platzhalter (`maklerHeaderSlot`, `kundeSidebar`, `KANZLEI_SECTIONS`) = „extrahiere den EXISTIERENDEN, unveraenderten JSX-Block in eine lokale Const" — das ist eine praezise Anweisung auf real vorhandenen Code (in Spec/Ist-Analyse verlinkt), kein offener TODO. Alle neuen Dateien haben vollstaendigen Code.

**Typ-Konsistenz:** `portalShellClasses` (0.1) → konsumiert in PortalShell (0.3). `usePortalShellDrawer`/`inShellDrawer`/`onNavigate` (0.2) → konsumiert in PortalNav (0.4). `PortalShellProps` (`sidebar`/`breakpoint`/`contentOffsetClass`/`mobileNav`/`mobileHeader`/`desktopTopRight`/`contentClassName`) durchgaengig identisch in allen Layout-Tasks.

## Execution Handoff

Siehe Ende dieses Prozesses — Subagent-Driven empfohlen (frischer Subagent pro Task, Review zwischen Tasks).
