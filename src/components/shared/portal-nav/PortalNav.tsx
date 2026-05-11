'use client'

// AAR-778: Shared Portal-Nav für alle Portale.
// Zwei Varianten:
//   'dark'  = Navy-Sidebar (Admin, Dispatch) — self-contained mit Mobile-Bottom-Nav
//   'light' = Weiße Sidebar (Kanzlei, Mitarbeiter)
//
// KundeNav + GutachterShell bleiben eigenständig (Branding/Theming durch Layout).

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { ExternalLinkIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

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
  useSidebarWidthVar('224px')

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function renderDarkItem(item: PortalNavItem) {
    const active = isActive(item.href, item.exact)
    const cls = `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
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
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-500 ${
          active ? 'bg-claimondo-ondo text-white' : 'text-claimondo-ondo hover:bg-claimondo-bg'
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {renderBadge?.(item) ?? null}
      </Link>
    )
  }

  if (variant === 'dark') {
    return (
      <>
        <aside
          role="navigation"
          aria-label={ariaLabel ?? 'Portal-Navigation'}
          className={`hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40 bg-claimondo-navy ${className}`}
        >
          {headerSlot && <div className="px-5 py-5">{headerSlot}</div>}

          <nav className="flex-1 px-3 overflow-y-auto">
            {sections.map((section, i) => (
              <div
                key={section.label ?? i}
                className={`space-y-0.5 ${i > 0 ? 'pt-3 mt-3 border-t border-white/10' : 'pb-4'}`}
              >
                {section.label && (
                  <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-claimondo-light-blue/70 font-semibold">
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

        {mobileItems && mobileItems.length > 0 && (
          <nav
            aria-label="Mobile Navigation"
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center glass-dark shadow-ios-md"
            style={{ paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
          >
            {mobileItems.map((item) => {
              const active = isActive(item.href, item.exact)
              const cls = `flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
                active ? 'text-white bg-claimondo-shield' : 'text-claimondo-light-blue'
              }`
              if (item.external) {
                return (
                  <a key={item.href} href={item.href} target="_blank" rel="noopener" className={cls}>
                    <item.icon style={{ width: 20, height: 20 }} />
                    <span className="text-[9px] font-medium">{item.label}</span>
                  </a>
                )
              }
              return (
                <Link key={item.href} href={item.href} className={cls}>
                  <item.icon style={{ width: 20, height: 20 }} />
                  <span className="text-[9px] font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </>
    )
  }

  // light variant
  return (
    <aside
      role="navigation"
      aria-label={ariaLabel ?? 'Portal-Navigation'}
      className={`w-56 shrink-0 border-r border-claimondo-border bg-white overflow-y-auto ${className}`}
    >
      <div className="flex flex-col gap-0.5 p-3">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={i > 0 ? 'pt-3 mt-3 border-t border-claimondo-border' : ''}>
            {section.label && (
              <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold">
                {section.label}
              </p>
            )}
            {section.items.map(renderLightItem)}
          </div>
        ))}
      </div>
    </aside>
  )
}
