'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronRight, Search } from 'lucide-react'

// Mobile-Navigation (< md): Hamburger -> Glass-Panel mit allen Header-Punkten.
// Fix 2026-06-15 (Aaron): vorher war die Desktop-Nav `hidden md:flex` ohne
// Mobile-Pendant -> kein Header-Punkt war auf dem Handy erreichbar. Daten kommen
// als Props aus der LandingTopbar (Server-Component mit den next-intl-Labels),
// damit der Header eine Server-Component bleiben kann.

type NavItem = { href: string; label: string }
type Cluster = { hubHref: string; label: string; items: ReadonlyArray<NavItem> }

type Props = {
  links: ReadonlyArray<NavItem>
  ratgeber: Cluster
  gutachter: Cluster
  finder: NavItem
  /** #18 P4: optionaler zweiter Finder (Werkstatt finden) – dezenter unter dem Primär-CTA. */
  finder2?: NavItem
  menuLabel: string
  closeLabel: string
}

export function MobileNav({ links, ratgeber, gutachter, finder, finder2, menuLabel, closeLabel }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={menuLabel}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-claimondo-navy backdrop-blur-sm transition-all duration-200 hover:bg-white active:scale-95"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={menuLabel}>
          <style>{`@keyframes mnav-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}@keyframes mnav-fade{from{opacity:0}to{opacity:1}}`}</style>
          {/* Backdrop */}
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-claimondo-navy/45"
            style={{ animation: 'mnav-fade 180ms ease-out', WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)' }}
          />
          {/* Panel – slidet von oben unter den Header */}
          <nav
            className="absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto rounded-b-3xl border-b border-white/40 bg-white/95 p-4 shadow-[0_24px_64px_rgba(13,27,62,0.28)]"
            style={{ animation: 'mnav-in 200ms cubic-bezier(0.16,1,0.3,1)', WebkitBackdropFilter: 'saturate(180%) blur(24px)', backdropFilter: 'saturate(180%) blur(24px)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-claimondo-ondo">{menuLabel}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="rounded-full p-2 text-claimondo-ondo transition-colors hover:bg-claimondo-bg"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {/* Primär-CTA: Gutachter finden */}
            <Link
              href={finder.href}
              onClick={() => setOpen(false)}
              className="mb-3 flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-3.5 text-base font-bold text-white shadow-[0_8px_24px_rgba(13,27,62,0.26)] transition-all duration-200 hover:bg-claimondo-shield active:scale-[0.98]"
            >
              <Search className="h-5 w-5" aria-hidden />
              {finder.label}
            </Link>

            {/* Sekundär-CTA: Werkstatt finden (#18 P4) – dezenter Outline-Stil */}
            {finder2 && (
              <Link
                href={finder2.href}
                onClick={() => setOpen(false)}
                className="mb-3 flex items-center justify-center gap-2 rounded-full border border-claimondo-navy/20 bg-white px-5 py-3 text-base font-bold text-claimondo-navy transition-all duration-200 hover:border-claimondo-navy/40 hover:bg-claimondo-bg active:scale-[0.98]"
              >
                <Search className="h-5 w-5" aria-hidden />
                {finder2.label}
              </Link>
            )}

            {/* Einfache Links */}
            <div className="space-y-0.5">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-ios-md px-3 py-3 text-[15px] font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-navy/5"
                >
                  {l.label}
                  <ChevronRight className="h-4 w-4 text-claimondo-ondo/45" aria-hidden />
                </Link>
              ))}
            </div>

            {/* Cluster-Sektionen (Ratgeber / Gutachter) mit Sub-Items */}
            {[ratgeber, gutachter].map((c) => (
              <div key={c.hubHref} className="mt-3 border-t border-claimondo-border/60 pt-3">
                <Link
                  href={c.hubHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-ios-md px-3 py-2 text-[15px] font-bold text-claimondo-navy transition-colors hover:bg-claimondo-navy/5"
                >
                  {c.label}
                  <ChevronRight className="h-4 w-4 text-claimondo-ondo/45" aria-hidden />
                </Link>
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {c.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-ios-md px-3 py-2.5 text-sm font-medium text-claimondo-ondo transition-colors hover:bg-claimondo-navy/5 hover:text-claimondo-navy"
                    >
                      {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
