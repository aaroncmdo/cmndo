'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PILLARS, BELIEBT, TOOLS, ChevronDown, ArrowRight } from './nav-data'
import { SiteSearch } from './SiteSearch'
import { SITE } from '@/lib/site'

// Mobile-Navigation (Hub-Redesign §1): Hamburger → Vollbild-Akkordeon mit Suche,
// aufklappbaren Themenfeldern (Pillars + Beliebte Themen) + Werkzeugen, Primaer-CTA
// und Telefon-CTA. Client-Island: schliesst bei Routenwechsel (Layout remountet bei
// Client-Nav nicht) und sperrt den Body-Scroll, solange offen.
export function MobileNav() {
  const [open, setOpen] = useState(false)

  // Menue schliesst sich per onClick je Link (event-getrieben) — bewusst KEIN
  // setState-in-Effect (Cascading-Renders-Lint). Body-Scroll sperren wenn offen:
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const phoneHref = `tel:${SITE.phone.replace(/[^+\d]/g, '')}`
  const summaryCls =
    'flex cursor-pointer list-none items-center justify-between py-3.5 text-[17px] font-semibold text-au-ink [&::-webkit-details-marker]:hidden'
  const iconCls = 'flex-none text-au-amber [&_svg]:h-5 [&_svg]:w-5'

  return (
    <div className="ml-auto md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] text-au-ink"
      >
        <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-auto border-t border-au-sand-dark bg-au-paper px-5 py-5">
          <div className="mb-4">
            <SiteSearch variant="mobile" />
          </div>

          <details className="border-b border-au-sand-dark">
            <summary className={summaryCls}>
              Themenfelder <ChevronDown className="h-5 w-5 text-au-amber" />
            </summary>
            <div className="pb-3">
              <p className="px-1 pb-1 pt-2 font-mono text-[10px] font-bold uppercase tracking-widest text-au-ink-faint">Nach Phase</p>
              {PILLARS.map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setOpen(false)} className="flex items-center gap-3 py-2.5 text-[15px] font-medium text-au-ink">
                  <span className={iconCls}>{p.icon}</span>
                  {p.label}
                </Link>
              ))}
              <p className="px-1 pb-1 pt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-au-ink-faint">Beliebte Themen</p>
              {BELIEBT.map((b) => (
                <Link key={b.href} href={b.href} onClick={() => setOpen(false)} className="block py-2 text-[15px] text-au-ink-soft">
                  {b.label}
                </Link>
              ))}
            </div>
          </details>

          <details className="border-b border-au-sand-dark">
            <summary className={summaryCls}>
              Werkzeuge <ChevronDown className="h-5 w-5 text-au-amber" />
            </summary>
            <div className="pb-3">
              {TOOLS.map((t) => (
                <Link key={t.href} href={t.href} onClick={() => setOpen(false)} className="flex items-center gap-3 py-2.5 text-[15px] font-medium text-au-ink">
                  <span className={iconCls}>{t.icon}</span>
                  {t.label}
                </Link>
              ))}
            </div>
          </details>

          <Link href="/gutachter-finden" onClick={() => setOpen(false)} className="mt-5 flex items-center justify-center gap-2 rounded-full bg-au-amber px-5 py-3.5 font-semibold text-white [&_svg]:h-4 [&_svg]:w-4">
            Gutachter finden <ArrowRight />
          </Link>
          <a href={phoneHref} onClick={() => setOpen(false)} className="mt-3 flex items-center justify-center gap-2 rounded-full border border-au-sand-dark py-3.5 font-semibold text-au-ink">
            Anrufen · {SITE.phone}
          </a>
        </div>
      ) : null}
    </div>
  )
}
