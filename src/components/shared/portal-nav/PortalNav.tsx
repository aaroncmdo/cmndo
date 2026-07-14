'use client'

// AAR-778: Shared Portal-Nav für alle Portale.
// Zwei Varianten:
//   'dark'  = Navy-Sidebar (Admin, Dispatch) — self-contained mit Mobile-Bottom-Nav
//   'light' = Weiße Sidebar (Kanzlei, Mitarbeiter)
//
// KundeNav + GutachterShell bleiben eigenständig (Branding/Theming durch Layout).
// Mobile-Bottom-Nav (Pille + Menü-Sheet) kommt aus dem geteilten @/components/shared/mobile-nav.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLinkIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { MobileNav } from '@/components/shared/mobile-nav'
import { MobileUpdatesDot } from '@/components/shared/updates/MobileUpdatesDot'
import { SidebarWidthVar } from '@/components/shared/SidebarWidthVar'

// Breite des Sidebar-Streifens: 8px Margin + w-52 (208px) + 8px Margin = 224px.
// Die Sidebar ist ein EINGERUECKTES Panel (top-2/left-2/bottom-2) — der Streifen
// muss die Margins mit abdecken, sonst bleibt bei offenem Overlay ein heller,
// ungedimmter Rahmen um die Sidebar stehen (der Dim waere nicht durchgaengig).
// Siehe src/components/primitives/overlay/overlay-layers.ts.
const SIDEBAR_STRIP_WIDTH = '224px'

export type PortalNavItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  external?: boolean
}

export type PortalNavSection = {
  /** Optionale Sektions-Überschrift (z.B. „Arbeit", „Nachschlagen") */
  label?: string
  items: PortalNavItem[]
}

type Props = {
  /** 'dark' = Navy (Admin/Dispatch) | 'light' = Weiß (Kanzlei/Mitarbeiter) */
  variant?: 'dark' | 'light'
  sections: PortalNavSection[]
  /** Mobile-Bottom-Nav Items — die ersten 4 werden zu Primaer-Tabs. */
  mobileItems?: PortalNavItem[]
  /** Logo + Portal-Badge + E-Mail (dark: oben in der Sidebar) */
  headerSlot?: ReactNode
  /** Support + Avatar + Logout (dark: unten in der Sidebar / Mobile: unten in der Menü-Sheet) */
  footerSlot?: ReactNode
  /** Badge rechts neben einem Item (z.B. TasksPill, Rückrufe-Counter) */
  renderBadge?: (item: PortalNavItem) => ReactNode
  /** Slot oben in der mobilen Menü-Sheet (z.B. UpdatesNav für admin/dispatch, deren footerSlot keine Updates trägt). */
  mobileSheetTop?: ReactNode
  ariaLabel?: string
  /** Zusätzliche CSS-Klassen für das Wurzel-Element (z.B. 'hidden md:flex md:flex-col') */
  className?: string
}

export function PortalNav({
  variant = 'dark',
  sections,
  mobileItems,
  headerSlot,
  footerSlot,
  renderBadge,
  mobileSheetTop,
  ariaLabel,
  className = '',
}: Props) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function renderDarkItem(item: PortalNavItem) {
    const active = isActive(item.href, item.exact)
    const cls = `flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors duration-500 ${
      active ? 'bg-claimondo-shield text-white font-semibold' : 'text-claimondo-light-blue hover:bg-white/5 hover:text-white'
    }`
    if (item.external) {
      return (
        <a key={item.href} href={item.href} target="_blank" rel="noopener" className={cls}>
          <item.icon style={{ width: 17, height: 17 }} />
          {item.label}
          <ExternalLinkIcon style={{ width: 12, height: 12 }} className="ml-auto opacity-40" />
        </a>
      )
    }
    return (
      <Link key={item.href} href={item.href} className={cls}>
        <item.icon style={{ width: 17, height: 17 }} />
        <span className="flex-1">{item.label}</span>
        {renderBadge?.(item) ?? null}
      </Link>
    )
  }

  function renderLightItem(item: PortalNavItem) {
    const active = isActive(item.href, item.exact)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-ios-lg text-sm font-medium transition-colors duration-500 ${
          active ? 'bg-claimondo-shield text-white' : 'text-claimondo-light-blue hover:bg-white/5 hover:text-white'
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {renderBadge?.(item) ?? null}
      </Link>
    )
  }

  // Mobile: geteilte Bottom-Nav (Pille + Menü-Sheet) aus @/components/shared/mobile-nav.
  // 4 Primaer-Tabs aus mobileItems (Fallback: alle Items), volle sections in der Sheet,
  // footerSlot (Support/Avatar/Abmelden) unten in der Sheet.
  const allItems = sections.flatMap((s) => s.items)
  const mobilePrimary = (mobileItems ?? allItems).slice(0, 4)
  const mobileNav = (
    <MobileNav
      ariaLabel={ariaLabel}
      primary={mobilePrimary}
      sections={sections}
      brand={{ name: <span className="text-sm font-semibold text-white">Navigation</span> }}
      renderBadge={renderBadge}
      menuIndicator={<MobileUpdatesDot />}
      sheetTop={mobileSheetTop}
      sheetFooter={footerSlot}
    />
  )

  if (variant === 'dark') {
    return (
      <>
        <SidebarWidthVar width={SIDEBAR_STRIP_WIDTH} />

        {/* Freischwebende Sidebar auf der grauen Vollflaeche (bg-claimondo-bg):
            solides Navy-Panel, Margin ringsum + Rundung + Schatten. KEIN
            overflow-hidden — sonst clippt die Panel-Kante das Updates-/Support-
            Popover aus dem footerSlot (Aaron 10.07.: "schneidet die updates ab"). */}
        <aside
          role="navigation"
          aria-label={ariaLabel ?? 'Portal-Navigation'}
          data-sidebar-mode="bar"
          className={`hidden md:flex flex-col fixed top-2 left-2 bottom-2 w-52 z-40 rounded-ios-lg bg-claimondo-navy shadow-ios-lg ${className}`}
        >
          {headerSlot && <div className="px-5 py-5">{headerSlot}</div>}

          <nav className="flex-1 px-3 overflow-y-auto">
            {sections.map((section, i) => (
              <div
                key={section.label ?? i}
                className={`space-y-0.5 ${i > 0 ? 'pt-3 mt-3 border-t border-white/10' : ''} ${
                  i === 0 ? 'pb-4' : ''
                }`}
              >
                {section.label && (
                  <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider font-semibold text-claimondo-light-blue/70">
                    {section.label}
                  </p>
                )}
                {section.items.map(renderDarkItem)}
              </div>
            ))}
          </nav>

          {footerSlot && (
            <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
              {footerSlot}
            </div>
          )}
        </aside>

        {mobileNav}
      </>
    )
  }

  // light variant — Kanzlei/Mitarbeiter.
  // Solide Navy-Sidebar (brand-primary via claimondo-navy) mit hellblauen Items —
  // bildet zusammen mit dem Navy-Header eine durchgehende Navy-Chrome um die helle
  // Content-Fläche. Detached Navy-Panel (in-flow, m-2 statt fixed).
  return (
    <>
      <SidebarWidthVar width={SIDEBAR_STRIP_WIDTH} />

      <aside
        role="navigation"
        aria-label={ariaLabel ?? 'Portal-Navigation'}
        data-sidebar-mode="bar"
        className={`w-52 shrink-0 m-2 rounded-ios-lg overflow-hidden bg-claimondo-navy shadow-ios-lg ${className}`}
      >
        <div className="flex flex-col gap-0.5 p-3 overflow-y-auto">
          {sections.map((section, i) => (
            <div
              key={section.label ?? i}
              className={i > 0 ? 'pt-3 mt-3 border-t border-white/10' : ''}
            >
              {section.label && (
                <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider text-claimondo-light-blue/60 font-semibold">
                  {section.label}
                </p>
              )}
              {section.items.map(renderLightItem)}
            </div>
          ))}
        </div>
      </aside>
      {mobileNav}
    </>
  )
}
