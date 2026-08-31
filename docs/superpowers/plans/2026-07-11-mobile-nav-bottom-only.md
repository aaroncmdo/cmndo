# Mobile-First "Bottom-only" Portal-Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three bespoke mobile bottom-navs (PortalNav `renderMobileBar`/`renderMoreSheet`, SV `GutachterMobileTabBar`, Kunde `KundeNav mobile`) with ONE shared `@/components/shared/mobile-nav` composite: a floating navy bottom pill (4 primary tabs + "Menü") whose Menü tab opens a full-screen navy sheet (brand header · Updates · full nav · Posteingang · Profil · Abmelden). No top bar on mobile; the floating FAB goes desktop-only.

**Architecture:** New composite `shared/mobile-nav` (pure `split.ts` helpers + one client `MobileNav.tsx` that renders the pill + a hand-rolled navy bottom sheet). Consumers render `<MobileNav …>` at the `md:hidden`/`lg:hidden` breakpoint. PortalNav delegates its mobile rendering internally → all 7 PortalNav roles covered by one edit. SV + Kunde swap their bespoke bars. Desktop navigation is untouched everywhere.

**Tech Stack:** Next.js (App Router, client components), React, `next/navigation` `usePathname`, `next/link`, lucide-react icons, Tailwind with project tokens (`rounded-ios-*`, `shadow-ios-*`, `bg-claimondo-*`), vitest (node env), Playwright (mobile viewport smoke).

## Global Constraints

- Radii: only `rounded-ios-{sm,md,lg,xl}` (12/18/24/32). NEVER `rounded-2xl`/`rounded-xl` etc. (radii ratchet).
- Colors: only `bg-claimondo-*`/`text-claimondo-*` tokens or `var(--brand-*, #fallback)`. NO raw hex in `className`; raw hex in inline `style` only as `var(--brand-*, #hex)`.
- Brand tokens used: `var(--brand-sidebar-bg, #0D1B3E)` (pill/sheet bg), `var(--brand-secondary, #4573A2)` (active tab), `var(--brand-sidebar-text, #7BA3CC)`.
- Component-set: new composite lives in `@/components/shared/*` and is built on `primitives/*` where a primitive fits. A hand-rolled bottom **sheet** is allowed (sheets are not gated; only new hand-rolled buttons/cards/tables are).
- UI strings in German with correct Umlaute (`Menü`, `Schließen`, `Abmelden`).
- iOS safe area: pad the pill/sheet bottom with `env(safe-area-inset-bottom)`.
- Every task ends green: `npx tsc --noEmit` (0 new errors), `npm run check:token-audit -- --ratchet`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet` all 0-new.
- Worktree: `C:/Users/Aaron Sprafke/mnav`, branch `kitta/mobile-nav-bottom-only` (off staging). Run `npm ci` there once before Task 1 (needed for tsc/vitest/Playwright).

---

### Task 1: `shared/mobile-nav` types + pure split helpers (TDD)

**Files:**
- Create: `src/components/shared/mobile-nav/types.ts`
- Create: `src/components/shared/mobile-nav/split.ts`
- Test: `src/components/shared/mobile-nav/__tests__/split.test.ts`

**Interfaces:**
- Produces: `MobileNavItem`, `MobileNavSection`, `MobileNavProps` (types); `barItems(primary: MobileNavItem[]): MobileNavItem[]`; `isNavItemActive(item: {href:string; exact?:boolean}, pathname: string|null): boolean`.

- [ ] **Step 1: Write `types.ts`**

```ts
// src/components/shared/mobile-nav/types.ts
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type MobileNavItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  external?: boolean
}

export type MobileNavSection = {
  label?: string
  items: MobileNavItem[]
}

export type MobileNavProps = {
  /** Primaer-Items der Bottom-Pille; max. 4 werden gezeigt (5. Slot = Menue). */
  primary: MobileNavItem[]
  /** Vollstaendige Navigation (gruppiert) fuer die Menue-Sheet. */
  sections: MobileNavSection[]
  /** Sheet-Header-Branding: Logo-Node (optional) + Name-Node. */
  brand: { logo?: ReactNode; name: ReactNode }
  /** Punkt am Menue-Tab (offene Updates/Tasks). */
  hasUnread?: boolean
  /** Optionale Badge neben einem Tab-/Nav-Item. */
  renderBadge?: (item: MobileNavItem) => ReactNode
  /** Slot oben in der Sheet (z.B. Updates-Zeile, Schaden-melden-CTA). */
  sheetTop?: ReactNode
  /** Slot unten in der Sheet (z.B. Profil + Abmelden). */
  sheetFooter?: ReactNode
  ariaLabel?: string
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/components/shared/mobile-nav/__tests__/split.test.ts
import { describe, it, expect } from 'vitest'
import { barItems, isNavItemActive } from '../split'
import type { MobileNavItem } from '../types'

const item = (href: string, exact?: boolean): MobileNavItem =>
  ({ href, label: href, icon: (() => null) as unknown as MobileNavItem['icon'], exact })

describe('mobile-nav split', () => {
  it('barItems zeigt hoechstens 4 Primaer-Tabs', () => {
    const five = [item('/a'), item('/b'), item('/c'), item('/d'), item('/e')]
    expect(barItems(five).map((i) => i.href)).toEqual(['/a', '/b', '/c', '/d'])
  })

  it('barItems laesst < 4 unveraendert', () => {
    const two = [item('/a'), item('/b')]
    expect(barItems(two)).toHaveLength(2)
  })

  it('isNavItemActive: exact matcht nur exakt', () => {
    expect(isNavItemActive(item('/kunde', true), '/kunde')).toBe(true)
    expect(isNavItemActive(item('/kunde', true), '/kunde/termine')).toBe(false)
  })

  it('isNavItemActive: nicht-exact matcht Prefix', () => {
    expect(isNavItemActive(item('/admin/faelle'), '/admin/faelle/123')).toBe(true)
    expect(isNavItemActive(item('/admin/faelle'), '/admin/faellex')).toBe(false)
  })

  it('isNavItemActive: null pathname -> false', () => {
    expect(isNavItemActive(item('/a'), null)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/shared/mobile-nav`
Expected: FAIL — `Cannot find module '../split'`.

- [ ] **Step 4: Write `split.ts`**

```ts
// src/components/shared/mobile-nav/split.ts
import type { MobileNavItem } from './types'

/** Hoechstens 4 Primaer-Tabs; der 5. Slot ist immer der Menue-Tab. */
export function barItems(primary: MobileNavItem[]): MobileNavItem[] {
  return primary.slice(0, 4)
}

/** Aktiv-Zustand einer Route (exact = strikt, sonst Prefix). */
export function isNavItemActive(
  item: { href: string; exact?: boolean },
  pathname: string | null,
): boolean {
  if (!pathname) return false
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/shared/mobile-nav`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/mobile-nav/types.ts src/components/shared/mobile-nav/split.ts src/components/shared/mobile-nav/__tests__/split.test.ts
git commit -m "feat(mobile-nav): types + pure split helpers (TDD)"
```

---

### Task 2: `MobileNav.tsx` — floating pill + Menü sheet

**Files:**
- Create: `src/components/shared/mobile-nav/MobileNav.tsx`
- Create: `src/components/shared/mobile-nav/index.ts`

**Interfaces:**
- Consumes: `barItems`, `isNavItemActive` (Task 1); `MobileNavProps`, `MobileNavItem` (Task 1).
- Produces: `MobileNav` (named export) + re-export of types via `index.ts`. Rendered by Tasks 3–5.

Notes for the implementer:
- Hand-roll the sheet (do NOT use the `Modal` primitive — it is light/glass-styled; this nav sheet is dark/navy). Pattern mirrors the existing `PortalNav.renderMoreSheet` (`fixed inset-0` backdrop + `absolute bottom-0` navy panel) but adds Escape + body-scroll-lock for a11y.
- The pill styling is copied from the proven `GutachterMobileTabBar` (navy pill, `border-radius` via `rounded-ios-lg`, brand vars, safe-area).
- Breakpoint: use `md:hidden` (pill + sheet hidden ≥768px). SV currently uses `lg:hidden`; Task 4 passes a `className` override is NOT needed — SV keeps its own desktop sidebar which is `lg:` , but the shared pill uses `md:hidden`. This is acceptable: on md–lg tablets SV shows the pill (previously it showed the desktop sidebar). If SV must stay `lg:hidden`, add an optional `hideBreakpoint?: 'md'|'lg'` prop — see Task 4.

- [ ] **Step 1: Write `MobileNav.tsx`**

```tsx
// src/components/shared/mobile-nav/MobileNav.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { MenuIcon, XIcon } from 'lucide-react'
import { barItems, isNavItemActive } from './split'
import type { MobileNavItem, MobileNavProps } from './types'

const PILL_STYLE: React.CSSProperties = {
  paddingTop: 6,
  paddingBottom: 6,
  paddingLeft: 6,
  paddingRight: 6,
  marginBottom: 'env(safe-area-inset-bottom)',
  backgroundColor: 'var(--brand-sidebar-bg, #0D1B3E)',
  border: '1px solid color-mix(in srgb, white 8%, transparent)',
  boxShadow:
    '0 8px 28px color-mix(in srgb, var(--brand-sidebar-bg, #0D1B3E) 22%, transparent), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)',
}

function tabClass(active: boolean) {
  return `relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-ios-lg py-2 transition-all active:scale-[0.96] ${
    active ? 'text-white' : 'text-claimondo-light-blue'
  }`
}

export function MobileNav({
  primary,
  sections,
  brand,
  hasUnread,
  renderBadge,
  sheetTop,
  sheetFooter,
  ariaLabel,
}: MobileNavProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const tabs = barItems(primary)

  // Sheet schliesst bei Routenwechsel.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Escape schliesst, Body-Scroll gesperrt solange offen.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  function renderTab(item: MobileNavItem) {
    const active = isNavItemActive(item, pathname)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={tabClass(active)}
        style={active ? { backgroundColor: 'var(--brand-secondary, #4573A2)' } : undefined}
      >
        <item.icon style={{ width: 22, height: 22 }} />
        <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
        {renderBadge?.(item)}
      </Link>
    )
  }

  return (
    <>
      <nav
        aria-label={ariaLabel ?? 'Mobile Navigation'}
        data-mobile-nav="pill"
        className="md:hidden fixed left-3 right-3 bottom-3 z-50 flex items-stretch gap-1.5 rounded-ios-lg"
        style={PILL_STYLE}
      >
        {tabs.map(renderTab)}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Menü öffnen"
          className={tabClass(false)}
        >
          <span className="relative">
            <MenuIcon style={{ width: 22, height: 22 }} />
            {hasUnread && (
              <span
                className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-danger"
                aria-hidden
              />
            )}
          </span>
          <span className="text-[10px] font-semibold tracking-wide">Menü</span>
        </button>
      </nav>

      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="absolute bottom-0 left-0 right-0 flex flex-col max-h-[88vh] rounded-t-ios-xl bg-claimondo-navy border-t border-white/10"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                {brand.logo}
                {brand.name}
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Schließen"
                className="p-1 rounded-ios-md text-claimondo-light-blue hover:bg-white/5"
              >
                <XIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {sheetTop && <div className="mb-3">{sheetTop}</div>}
              {sections.map((section, i) => (
                <div
                  key={section.label ?? i}
                  className={i > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}
                >
                  {section.label && (
                    <p className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-claimondo-light-blue/70">
                      {section.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isNavItemActive(item, pathname)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors ${
                            active
                              ? 'bg-claimondo-shield text-white font-semibold'
                              : 'text-claimondo-light-blue hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <item.icon style={{ width: 18, height: 18 }} />
                          <span className="flex-1">{item.label}</span>
                          {renderBadge?.(item)}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {sheetFooter && (
              <div className="px-3 py-3 border-t border-white/10">{sheetFooter}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Write `index.ts`**

```ts
// src/components/shared/mobile-nav/index.ts
export { MobileNav } from './MobileNav'
export type { MobileNavItem, MobileNavSection, MobileNavProps } from './types'
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` (from worktree root; use `NODE_OPTIONS=--max-old-space-size=8192` if it OOMs)
Expected: 0 errors referencing `mobile-nav`.

- [ ] **Step 4: Ratchets**

Run: `npm run check:token-audit -- --ratchet && npm run check:component-set -- --ratchet`
Expected: both "0 neue". (No raw hex in className; brand hex only inside `var(--brand-*, #…)`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/mobile-nav/MobileNav.tsx src/components/shared/mobile-nav/index.ts
git commit -m "feat(mobile-nav): floating pill + navy Menü sheet component"
```

---

### Task 3: PortalNav delegates its mobile rendering to `MobileNav`

Covers 7 roles at once (admin, dispatch, kanzlei, makler, mitarbeiter, werkstatt, faelle) — they already pass `sections` + `mobileItems` + `footerSlot`.

**Files:**
- Modify: `src/components/shared/portal-nav/PortalNav.tsx`

**Interfaces:**
- Consumes: `MobileNav` from `@/components/shared/mobile-nav`.
- Behavior change: `renderMobileBar()` and `renderMoreSheet()` are replaced by a single `<MobileNav>` render. The desktop `<aside>` blocks are untouched.

- [ ] **Step 1: Import MobileNav**

Add to the import block near the top of `PortalNav.tsx`:
```tsx
import { MobileNav } from '@/components/shared/mobile-nav'
```

- [ ] **Step 2: Build the MobileNav props once, before the returns**

Just after `const barFloating = !isLight && floatingMode` (~line 145), add:
```tsx
// Mobile: geteilte Bottom-Nav (Pille + Menue-Sheet). 4 Primaer-Tabs aus
// mobileItems (Fallback: alle Items), volle sections in der Sheet, footerSlot
// (Support/Avatar/Abmelden) unten in der Sheet.
const mobilePrimary = (mobileItems ?? allItems).slice(0, 4)
const mobileNav = (
  <MobileNav
    ariaLabel={ariaLabel}
    primary={mobilePrimary}
    sections={sections}
    brand={{ name: <span className="text-sm font-semibold text-white">Navigation</span> }}
    renderBadge={renderBadge}
    sheetFooter={footerSlot}
  />
)
```

- [ ] **Step 3: Replace both mobile renders**

In the `variant === 'dark'` return, replace the two lines `{renderMobileBar()}` and `{renderMoreSheet()}` (~lines 323–324) with:
```tsx
{mobileNav}
```
In the light return, replace `{renderMobileBar()}` and `{renderMoreSheet()}` (~lines 365–366) with:
```tsx
{mobileNav}
```

- [ ] **Step 4: Delete the now-unused mobile renderers**

Delete the functions `renderMobileBarItem`, `renderMoreButton`, `renderMobileBar`, `renderMoreSheet` and the now-unused locals `barItems`, `showMore`, `barFloating`, `primaryItems` (keep `allItems` — used by `mobilePrimary`). Remove now-unused imports (`MoreHorizontalIcon`, `XIcon` if only used there — verify with a grep before removing). Keep `useState`/`moreOpen`? `moreOpen` is now unused → delete it and its `useState`.

- [ ] **Step 5: Typecheck + ratchets**

Run: `npx tsc --noEmit` → 0 errors. `npm run check:token-audit -- --ratchet` → note: this should DROP the `rounded-2xl` violation that lived in the old `renderMobileBar` (radii ratchet improves). `npm run check:knip -- --ratchet` → 0 new.

- [ ] **Step 6: Playwright mobile smoke (admin + kanzlei)**

Reuse the harness shape from `docs/superpowers/…` mobile tests: 390×844 context, login `smoke-admin@claimondo.test` / `Sm0ke-Admin-Cl@im!2026` → `/admin`; assert the pill (`[data-mobile-nav="pill"]`) is visible with exactly 5 slots (4 links + Menü button); tap Menü → the sheet shows sections + `footerSlot` (Abmelden); tap a nav link → route changes and sheet closes. Repeat login `test-kanzlei@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` → `/kanzlei`.
Expected: all assertions pass. (Run against the local dev server or staging.)

- [ ] **Step 7: Commit**

```bash
git add src/components/shared/portal-nav/PortalNav.tsx
git commit -m "feat(mobile-nav): PortalNav delegates mobile bar to shared MobileNav (7 roles)"
```

---

### Task 4: SV — GutachterShell uses MobileNav

**Files:**
- Modify: `src/app/gutachter/GutachterShell.tsx`
- (Optional) Modify: `src/components/shared/mobile-nav/MobileNav.tsx` — add `hideBreakpoint` prop if SV must stay `lg:hidden`.

**Interfaces:**
- Consumes: `MobileNav`, `MobileNavSection`.
- SV nav lives in `NAV_SECTIONS_BASE` (title/items with `badgeKey`, `beta`). Map to `MobileNavSection[]` (`title`→`label`). Primary tabs = Heute, Aufträge, Fälle, Kalender (the current `GutachterMobileTabBar` TABS). Badges via `renderBadge` using `badgeCounts`.

- [ ] **Step 1 (optional): add breakpoint prop to MobileNav**

If SV should keep hiding at `lg` (not `md`): in `MobileNav.tsx`, add `hideBreakpoint?: 'md' | 'lg'` to props (default `'md'`), and compute `const hide = hideBreakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'` and use it on the `<nav>` and the sheet `<div>` root className instead of the literal `md:hidden`. Update `types.ts` accordingly. Re-run `npx vitest run src/components/shared/mobile-nav` (still green — pure helpers unaffected).

- [ ] **Step 2: Map SV sections + render MobileNav**

In `GutachterShell.tsx`, build the mapped sections + primary near the other derived values:
```tsx
const svSections: import('@/components/shared/mobile-nav').MobileNavSection[] =
  NAV_SECTIONS_BASE.map((s) => ({
    label: s.title,
    items: s.items.map((it) => ({ href: it.href, label: it.label, icon: it.icon })),
  }))
const SV_PRIMARY_HREFS = ['/gutachter/heute', '/gutachter/auftraege', '/gutachter/faelle', '/gutachter/kalender']
const svPrimary = SV_PRIMARY_HREFS
  .map((h) => svSections.flatMap((s) => s.items).find((i) => i.href === h)!)
  .filter(Boolean)
```

- [ ] **Step 3: Replace `<GutachterMobileTabBar …>`**

Replace the `{!isFeldmodus && (<GutachterMobileTabBar … />)}` block (~lines 629–637) with:
```tsx
{!isFeldmodus && (
  <MobileNav
    hideBreakpoint="lg"
    ariaLabel="SV-Navigation"
    primary={svPrimary}
    sections={svSections}
    brand={{
      logo: logoUrl ? <img src={logoUrl} alt="" className="h-6 w-auto" /> : undefined,
      name: <span className="text-sm font-semibold text-white">{firmenname ?? 'Claimondo'}</span>,
    }}
    renderBadge={(item) => {
      const map: Record<string, number> = {
        '/gutachter/auftraege': badgeCounts.auftraege,
        '/gutachter/kalender': badgeCounts.neueTermine,
      }
      const n = map[item.href] ?? 0
      return n > 0 ? (
        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-danger text-white">
          {n > 99 ? '99+' : n}
        </span>
      ) : null
    }}
    sheetFooter={
      <form action="/api/auth/logout" method="POST">
        <button type="submit" className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue hover:bg-white/5 hover:text-white">
          <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
        </button>
      </form>
    }
  />
)}
```
(Confirm `LogOutIcon` is imported in this file; if not, add it to the lucide import.)

Remove the `import { GutachterMobileTabBar }` and add `import { MobileNav } from '@/components/shared/mobile-nav'`. Note: the mobile top bar `<SvMobileHeader …>` (~line 578) is **removed** per Ziel A (bottom-only) — delete that line. The brand logo now lives in the sheet header.

- [ ] **Step 4: Typecheck + ratchets + SV mobile smoke**

`npx tsc --noEmit` → 0. Ratchets 0-new. Playwright: login `test-sv@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` → `/gutachter`; assert pill with Heute/Aufträge/Fälle/Kalender + Menü; Menü sheet shows all SV sections + Abmelden; no top bar present.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/mobile-nav src/app/gutachter/GutachterShell.tsx
git commit -m "feat(mobile-nav): SV GutachterShell uses shared MobileNav (bottom-only)"
```

---

### Task 5: Kunde — layout + KundeNav use MobileNav

**Files:**
- Modify: `src/app/kunde/layout.tsx`
- Modify: `src/app/kunde/_components/KundeNav.tsx` (remove the `mobile` branch after the swap — Task 7)

**Interfaces:**
- Consumes: `MobileNav`, `MobileNavItem`. Kunde nav = `NAV_ITEMS` (in KundeNav). Primary = Mein Fall, Termine, Nachrichten (chat), Profil (the current `MOBILE_ITEMS`). Sheet extras: the SchadenMelden CTA + `LanguageSwitcher` + `OutboxBadge` + `UpdatesNav` move into `sheetTop`; Abmelden into `sheetFooter`.

Because Kunde's nav items live in `KundeNav.tsx` (client) and use i18n, the simplest split is: export the item arrays from `KundeNav.tsx` and render `<MobileNav>` from the client boundary. Since `kunde/layout.tsx` is a server component, render MobileNav inside a small client wrapper.

- [ ] **Step 1: Export Kunde nav config from KundeNav**

In `KundeNav.tsx`, export the arrays so a wrapper can build MobileNav props:
```tsx
export const KUNDE_NAV_ITEMS = NAV_ITEMS
export const KUNDE_MOBILE_PRIMARY = MOBILE_ITEMS
export const KUNDE_SCHADEN_HREF = SCHADEN_HREF
```
(These reference existing locals — verify names match the file; adapt if `NAV_ITEMS`/`MOBILE_ITEMS`/`SCHADEN_HREF` differ.)

- [ ] **Step 2: Create a client wrapper `KundeMobileNav.tsx`**

```tsx
// src/app/kunde/_components/KundeMobileNav.tsx
'use client'
import Link from 'next/link'
import { LogOutIcon, PlusCircleIcon } from 'lucide-react'
import { MobileNav } from '@/components/shared/mobile-nav'
import { KUNDE_NAV_ITEMS, KUNDE_MOBILE_PRIMARY, KUNDE_SCHADEN_HREF } from './KundeNav'

export function KundeMobileNav({ brandLogo, brandName, sheetTop }: {
  brandLogo?: React.ReactNode
  brandName: React.ReactNode
  sheetTop?: React.ReactNode
}) {
  return (
    <MobileNav
      ariaLabel="Kunde-Navigation"
      primary={KUNDE_MOBILE_PRIMARY}
      sections={[{ items: KUNDE_NAV_ITEMS }]}
      brand={{ logo: brandLogo, name: brandName }}
      sheetTop={
        <>
          <Link href={KUNDE_SCHADEN_HREF} className="flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm text-white bg-claimondo-shield">
            <PlusCircleIcon style={{ width: 18, height: 18 }} /> Schaden melden
          </Link>
          {sheetTop}
        </>
      }
      sheetFooter={
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue hover:bg-white/5 hover:text-white">
            <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
          </button>
        </form>
      }
    />
  )
}
```

- [ ] **Step 3: Swap the mobile header + bottom nav in `kunde/layout.tsx`**

Delete the `md:hidden` mobile `<header …>` block (~lines 433–462) AND the `md:hidden` mobile `<nav …><KundeNav mobile …/></nav>` block (~lines 477–486). In their place render:
```tsx
<KundeMobileNav
  brandName={
    branding.useBrand && branding.logoUrl
      ? <span className="sr-only">{branding.firmenname ?? 'Claimondo'}</span>
      : <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span style={{ color: accentBg }}>ondo</span></span>
  }
  brandLogo={branding.useBrand && branding.logoUrl
    ? <Image src={branding.logoUrl} alt={branding.firmenname ?? 'Logo'} width={120} height={28} unoptimized className="max-h-7 w-auto object-contain" />
    : undefined}
  sheetTop={
    <div className="flex items-center gap-2 px-3 pb-2">
      <LanguageSwitcher locale={activeLocale} variant="compact" />
      <OutboxBadge />
      <UpdatesNav variant="dark" />
    </div>
  }
/>
```
Add `import { KundeMobileNav } from './_components/KundeMobileNav'`. Since MobileNav is `fixed`, no wrapper needed. Adjust the main content top padding: the old `pt-14` (that offset the removed top bar) should be reduced — check the `<main>` className and drop the mobile top padding that compensated for the deleted header.

- [ ] **Step 4: Typecheck + ratchets + Kunde build**

`npx tsc --noEmit` → 0. Ratchets 0-new. Because this touches a layout, run the fuller `npm run build` (or at least `npx next build` for the kunde route) to catch RSC/client-boundary errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/kunde/_components/KundeMobileNav.tsx src/app/kunde/_components/KundeNav.tsx src/app/kunde/layout.tsx
git commit -m "feat(mobile-nav): Kunde layout uses shared MobileNav (bottom-only)"
```

---

### Task 6: FAB → desktop-only; Posteingang enters the Menü sheet

The floating `GlobalPosteingangFab` is rendered for admin (`admin/layout.tsx:77`), mitarbeiter (`mitarbeiter/layout.tsx:35`), SV (`GutachterShell.tsx:655`). Per Ziel A it disappears on mobile; the inbox becomes a "Posteingang" entry in the Menü sheet.

**Files:**
- Modify: `src/components/chat/GlobalPosteingangFab.tsx`

**Interfaces:**
- Behavior: the FAB root becomes desktop-only (`hidden lg:flex`). No consumer changes. (A dedicated in-sheet Posteingang entry can be a follow-up; for this plan the mobile FAB is simply removed from view — inbox stays reachable via the desktop breakpoint and the per-fall chat pages.)

- [ ] **Step 1: Make the FAB desktop-only**

In `GlobalPosteingangFab.tsx`, on the root wrapper (`className="fixed right-4 z-[9990] … bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] lg:bottom-4"`), prepend `hidden lg:flex` and drop the mobile-only bottom offset:
```tsx
className="hidden lg:flex fixed right-4 bottom-4 z-[9990] items-end gap-2"
```

- [ ] **Step 2: Typecheck + ratchets + smoke**

`npx tsc --noEmit` → 0. Ratchets 0-new. Playwright mobile (admin, 390×844): assert NO `[data-chat-outside-ok]` FAB visible; desktop (1440) still shows it.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/GlobalPosteingangFab.tsx
git commit -m "feat(mobile-nav): GlobalPosteingangFab desktop-only (FAB off mobile)"
```

---

### Task 7: Dead-code cleanup + baselines

**Files:**
- Modify: `src/app/gutachter/GutachterMobileTabBar.tsx` (delete if 0 consumers)
- Modify: `src/app/kunde/_components/KundeNav.tsx` (remove the now-unused `mobile` branch)
- Modify: `src/components/sv/SvMobileHeader.*` (delete if 0 consumers after Task 4)
- Modify: `scripts/knip-baseline.json`, `scripts/component-set-baseline.json` if applicable

- [ ] **Step 1: Remove dead files/branches**

Grep each before deleting:
```bash
git grep -n "GutachterMobileTabBar" -- src   # expect 0 after Task 4 → delete the file
git grep -n "SvMobileHeader" -- src           # if 0 → delete the file(s)
git grep -n "mobile" src/app/kunde/_components/KundeNav.tsx  # remove the `if (mobile)` return branch + the `mobile` prop
```
Delete files that now have 0 consumers. In `KundeNav.tsx`, delete the `if (mobile) { … }` block and the `mobile` prop from its signature (the exports added in Task 5 stay).

- [ ] **Step 2: Update knip baseline (Boy-Scout, down only)**

Run: `npm run check:knip -- --ratchet`. If it reports FEWER dead files (good), lower the baseline: `npm run check:knip -- --update-baseline`. Never raise it.

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` → 0. `npm run build` → success (touches layouts). `npm run check:token-audit -- --ratchet` / `check:component-set -- --ratchet` / `check:knip -- --ratchet` → all 0-new. `npx vitest run src/components/shared/mobile-nav` → green.

- [ ] **Step 4: Final Playwright mobile matrix**

390×844 across admin, dispatch, kanzlei, SV, kunde: pill visible (4 tabs + Menü), Menü opens the navy sheet with full nav + Abmelden, route-change closes it, active tab marked, NO top bar, NO FAB. Desktop (1440) unchanged for each.

- [ ] **Step 5: Commit + push + PR**

```bash
git add -A
git commit -m "chore(mobile-nav): remove bespoke mobile bars (dead-code) + knip baseline"
git push -u origin kitta/mobile-nav-bottom-only
gh pr create --base staging --title "feat(mobile-nav): einheitliche Bottom-only Mobile-Navigation (Ziel A)" --body "Siehe docs/superpowers/specs/2026-07-11-mobile-nav-bottom-only-design.md + plan."
```

---

## Self-Review

**Spec coverage:**
- Shared `shared/mobile-nav` composite (pille + sheet + split helper) → Tasks 1–2. ✓
- Consumers at `md:hidden` replace 3 bespoke bars → PortalNav (Task 3), SV (Task 4), Kunde (Task 5). ✓
- Desktop unchanged → Tasks touch only mobile renders / FAB breakpoint. ✓
- Floating navy pill, 4 primary + Menü, safe-area, badge on Menü → Task 2. ✓
- Menü sheet: brand header · Updates · full nav · Posteingang · Profil · Abmelden; dismiss X/backdrop/Esc; scroll-lock → Task 2 (Updates/Posteingang/Profil injected via `sheetTop`/`sheetFooter` by consumers: Kunde Task 5; SV/PortalNav footer). ✓ (Posteingang folded via FAB-desktop-only Task 6; an explicit in-sheet Posteingang row is a noted follow-up.)
- Branding via `var(--brand-*)`, logo in sheet header → Task 2 + consumers. ✓
- Testing: vitest split (Task 1) + Playwright mobile per phase + final matrix (Task 7). ✓
- Rollout phases 1–6 → Tasks 1–7. ✓

**Placeholder scan:** No "TBD"/"handle edge cases" — every code step has real code. The one deferral (explicit in-sheet Posteingang row vs FAB-desktop-only) is called out as a follow-up, not a gap.

**Type consistency:** `MobileNavItem`/`MobileNavSection`/`MobileNavProps` defined in Task 1, consumed identically in Tasks 2–5. `barItems`/`isNavItemActive` names consistent. `hideBreakpoint` prop introduced in Task 4 Step 1 and used only there.

**Open follow-ups (non-blocking):** exact per-role primary lists may be tuned with Aaron during execution; explicit in-sheet Posteingang row (currently FAB is just hidden on mobile).
