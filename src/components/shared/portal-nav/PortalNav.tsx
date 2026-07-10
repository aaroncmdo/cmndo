'use client'

// AAR-778: Shared Portal-Nav für alle Portale.
// Zwei Varianten:
//   'dark'  = Navy-Sidebar (Admin, Dispatch) — self-contained mit Mobile-Bottom-Nav
//   'light' = Weiße Sidebar (Kanzlei, Mitarbeiter)
//
// KundeNav + GutachterShell bleiben eigenständig (Branding/Theming durch Layout).

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ExternalLinkIcon, MoreHorizontalIcon, XIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useFloatingSidebar } from '@/lib/branding/use-floating-sidebar'

// CMM-32 P2: --app-sidebar-width auf <html> setzen, damit Portal-rendered
// Modals (Modal.web.tsx) ihren Backdrop nur über den Content-Bereich legen
// und die Sidebar nicht einschließen. PortalNav nutzt w-56 = 224px ab md+.
function useSidebarWidthVar(width: string, breakpoint: string = '(min-width: 768px)') {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(breakpoint)
    const apply = () => {
      document.documentElement.style.setProperty(
        '--app-sidebar-width',
        mql.matches ? width : '0px',
      )
    }
    apply()
    mql.addEventListener('change', apply)
    return () => {
      mql.removeEventListener('change', apply)
      document.documentElement.style.removeProperty('--app-sidebar-width')
    }
  }, [width, breakpoint])
}

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
  /** Mobile-Bottom-Nav Items — nur dark variant */
  mobileItems?: PortalNavItem[]
  /** Logo + Portal-Badge + E-Mail (dark: oben in der Sidebar) */
  headerSlot?: ReactNode
  /** Support + Avatar + Logout (dark: unten in der Sidebar) */
  footerSlot?: ReactNode
  /** Badge rechts neben einem Item (z.B. TasksPill, Rückrufe-Counter) */
  renderBadge?: (item: PortalNavItem) => ReactNode
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
  ariaLabel,
  className = '',
}: Props) {
  const pathname = usePathname()
  const floatingMode = useFloatingSidebar()
  // Sidebar bleibt w-56 (224 px) in beiden Modi — Floating-Pills sitzen mit
  // py-3 px-3 INNERHALB der Sidebar-Breite, kein Layout-Offset nötig.
  useSidebarWidthVar('224px')
  const [moreOpen, setMoreOpen] = useState(false)

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

  // --- Mobile-Bottom-Nav + Overflow-Sheet (beide Varianten) -------------------
  // Mobile-Audit 29.06.: die light-Variante hatte GAR keinen Bottom-Nav; dark
  // zeigte nur `mobileItems` ohne Overflow. Jetzt: bis zu 5 Primaer-Items (4 +
  // "Mehr" sobald mehr Nav existiert) — "Mehr" oeffnet ein Sheet mit der vollen
  // sections-Liste + footerSlot. Heilt KB/Kanzlei (light) + Admin/Dispatch (dark).
  // Beide Varianten sind seit dem Navy-Redesign (#3258) farbgleich (navy + light-blue);
  // light ignoriert floatingMode (wie ihre Sidebar, data-sidebar-mode="bar").
  const isLight = variant === 'light'
  const allItems = sections.flatMap((s) => s.items)
  const primaryItems = mobileItems ?? allItems
  const showMore = allItems.length > primaryItems.length || primaryItems.length > 5
  const barItems = showMore ? primaryItems.slice(0, 4) : primaryItems
  const barFloating = !isLight && floatingMode

  // Sheet schliesst bei Routenwechsel (Tap auf ein Item -> pathname aendert sich).
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  // Escape schliesst das Sheet, Body-Scroll wird gesperrt solange offen.
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [moreOpen])

  function renderMobileBarItem(item: PortalNavItem) {
    const active = isActive(item.href, item.exact)
    const cls = `flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-2 py-1 rounded-ios-xl transition-all ${
      active ? 'text-white bg-claimondo-shield' : 'text-claimondo-light-blue'
    }`
    const inner = (
      <>
        <item.icon style={{ width: 20, height: 20 }} />
        <span className="text-[9px] font-medium">{item.label}</span>
      </>
    )
    if (item.external) {
      return (
        <a key={item.href} href={item.href} target="_blank" rel="noopener" className={cls}>
          {inner}
        </a>
      )
    }
    return (
      <Link key={item.href} href={item.href} className={cls}>
        {inner}
      </Link>
    )
  }

  function renderMoreButton() {
    return (
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        aria-label="Mehr Navigation"
        className="flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-2 py-1 rounded-ios-xl text-claimondo-light-blue"
      >
        <MoreHorizontalIcon style={{ width: 20, height: 20 }} />
        <span className="text-[9px] font-medium">Mehr</span>
      </button>
    )
  }

  function renderMobileBar() {
    if (barItems.length === 0) return null
    return (
      <nav
        aria-label="Mobile Navigation"
        data-sidebar-mode={barFloating ? 'floating' : 'bar'}
        className={`md:hidden fixed z-50 flex justify-around items-center ${
          barFloating ? 'left-3 right-3 bottom-3 rounded-2xl' : 'bottom-0 left-0 right-0 glass-dark shadow-ios-md'
        }`}
        style={{
          paddingTop: 8,
          paddingBottom: barFloating ? 8 : 'calc(8px + env(safe-area-inset-bottom))',
          ...(barFloating
            ? {
                // 2026-06-28: solide statt 55%-Glas (analog Desktop-Sidebar #3258).
                backgroundColor: 'var(--brand-sidebar-bg, #0D1B3E)',
                border: '1px solid color-mix(in srgb, white 8%, transparent)',
                boxShadow:
                  '0 8px 28px color-mix(in srgb, var(--brand-sidebar-bg, #0D1B3E) 22%, transparent), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)',
                marginBottom: 'env(safe-area-inset-bottom)',
              }
            : {}),
        }}
      >
        {barItems.map(renderMobileBarItem)}
        {showMore && renderMoreButton()}
      </nav>
    )
  }

  function renderMoreSheet() {
    if (!moreOpen) return null
    const renderItem = isLight ? renderLightItem : renderDarkItem
    return (
      <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Navigation">
        <button
          type="button"
          aria-label="Schliessen"
          onClick={() => setMoreOpen(false)}
          className="absolute inset-0 bg-black/40"
        />
        <div
          className="absolute bottom-0 left-0 right-0 max-h-[78vh] overflow-y-auto rounded-t-ios-xl p-4 bg-claimondo-navy border-t border-white/10"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Navigation</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label="Schliessen"
              className="p-1 rounded-ios-md text-claimondo-light-blue hover:bg-white/5"
            >
              <XIcon style={{ width: 18, height: 18 }} />
            </button>
          </div>
          {sections.map((section, i) => (
            <div key={section.label ?? i} className={i > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
              {section.label && (
                <p className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-claimondo-light-blue/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">{section.items.map(renderItem)}</div>
            </div>
          ))}
          {footerSlot && <div className="mt-3 pt-3 border-t border-white/10">{footerSlot}</div>}
        </div>
      </div>
    )
  }

  if (variant === 'dark') {
    return (
      <>
        {/* 2026-05-14: Dark-Variant erbt floating-Pills via data-sidebar-mode
            (CSS in globals.css). Floating-Default app-weit (Hook merkt die
            Bar-Opt-out-Präferenz in localStorage). */}
        {/* Detached Glass-Panel auf Navy-Canvas: die Layouts setzen jetzt einen
            durchgehenden Navy-Canvas (md:bg-claimondo-navy), auf dem diese Sidebar
            schwebt. Glas (SV-Rezept: 55% + blur + heller Border + inset-Highlight)
            hebt sie vom Navy-Canvas ab — solides Navy wuerde damit verschmelzen.
            So schwebt die Sidebar "vollstaendig frei" wie im SV-Portal. */}
        <aside
          role="navigation"
          aria-label={ariaLabel ?? 'Portal-Navigation'}
          data-sidebar-mode="bar"
          className={`hidden md:flex flex-col fixed top-4 left-4 bottom-4 w-52 z-40 rounded-ios-lg overflow-hidden ${className}`}
          style={{
            backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg) 55%, transparent)',
            backdropFilter: 'saturate(180%) blur(22px)',
            WebkitBackdropFilter: 'saturate(180%) blur(22px)',
            border: '1px solid color-mix(in srgb, white 22%, transparent)',
            boxShadow:
              '0 14px 36px color-mix(in srgb, var(--brand-sidebar-bg) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 25%, transparent)',
          }}
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

        {renderMobileBar()}
        {renderMoreSheet()}
      </>
    )
  }

  // light variant — Kanzlei/Mitarbeiter.
  // 2026-06-26 (Design-Review Aaron): Vorher Floating-Frosted-Weiß
  // (white 65% + blur) auf hellem claimondo-bg = washed-out, durchsichtig,
  // kaum Kontrast. Jetzt solide Navy-Sidebar (brand-primary via claimondo-navy)
  // mit hellblauen Items — bildet zusammen mit dem vorhandenen Navy-Header
  // (glass-dark) eine durchgehende Navy-Chrome um die helle Content-Fläche,
  // analog zum Gutachter-Portal. Committed Markenfarbe statt Glassmorphism.
  // Floating-Toggle wird hier bewusst ignoriert (das Glas WAR das Problem);
  // data-sidebar-mode="bar" verhindert die Floating-Glass-CSS-Regeln.
  return (
    <>
    {/* Detached Navy-Panel (in-flow, m-2 statt fixed → floatet INNERHALB des
        bestehenden Flex-Layouts; kein Offset/Restructure noetig, Top-Bar bleibt).
        w-52 + m-2 = ~alte w-56-Breite, Layout unveraendert. */}
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
    {renderMobileBar()}
    {renderMoreSheet()}
    </>
  )
}
