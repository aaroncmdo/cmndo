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
  menuIndicator,
  renderBadge,
  sheetTop,
  sheetFooter,
  hideBreakpoint = 'md',
  ariaLabel,
  activeHref,
}: MobileNavProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const tabs = barItems(primary)
  const hide = hideBreakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'

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
    const active = activeHref !== undefined ? item.href === activeHref : isNavItemActive(item, pathname)
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
        className={`${hide} fixed left-3 right-3 bottom-3 z-50 flex items-stretch gap-1.5 rounded-ios-lg`}
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
            {menuIndicator}
          </span>
          <span className="text-[10px] font-semibold tracking-wide">Menü</span>
        </button>
      </nav>

      {menuOpen && (
        <div
          className={`${hide} fixed inset-0 z-[60]`}
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
                      const active = activeHref !== undefined ? item.href === activeHref : isNavItemActive(item, pathname)
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
