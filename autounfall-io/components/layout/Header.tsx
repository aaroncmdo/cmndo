import Link from 'next/link'
import Image from 'next/image'
import { PILLARS, BELIEBT, TOOLS, ChevronDown, ArrowRight } from './nav-data'
import { SiteSearch } from './SiteSearch'
import { MobileNav } from './MobileNav'

// GlobalHeader (Hub-Redesign §1): Sticky Glass-Header, echte logo.png-Wortmarke
// (genau EINMAL), 2-Spalten-Mega-Menue "Themenfelder" (Nach Phase + Beliebte
// Themen), "Werkzeuge"-Dropdown, Titel-/Slug-Suche, Amber-Primaeraktion. Desktop-
// Dropdowns CSS-only (hover + focus-within, keyboard-zugaenglich), Mobile via
// MobileNav-Island. Linien-Icons (SVG), KEINE Emojis.

const triggerCls =
  'flex items-center gap-1.5 py-1.5 text-[15px] font-medium text-au-ink-faint transition-colors group-hover:text-au-amber group-focus-within:text-au-amber'
const panelCls =
  'invisible absolute left-0 top-[calc(100%+12px)] z-50 translate-y-1.5 rounded-ios-md border border-au-sand-dark bg-au-surface p-3 opacity-0 shadow-au-lg transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100'
const iconChipCls =
  'flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-au-amber-tint text-au-amber [&_svg]:h-[19px] [&_svg]:w-[19px]'
const colHeadCls = 'mb-1 px-3 pt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-au-ink-faint'

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-au-sand-dark bg-au-paper-warm/85 backdrop-blur-lg backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-[72px] max-w-[1170px] items-center gap-5 px-5 sm:px-[22px]">
        {/* Logo — genau einmal (logo.png Wortmarke) */}
        <Link href="/" aria-label="autounfall.io · Startseite" className="flex-none">
          <Image src="/logo.png" alt="autounfall.io" width={630} height={160} priority className="h-[30px] w-auto" />
        </Link>

        {/* Desktop-Navigation */}
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-6 md:flex">
          {/* Themenfelder — 2-Spalten-Mega-Menue */}
          <div className="group relative">
            <button type="button" aria-haspopup="true" className={triggerCls}>
              Themenfelder <ChevronDown />
            </button>
            <div className={`${panelCls} w-[580px]`} role="menu">
              <div className="grid grid-cols-2 gap-x-3">
                <div>
                  <p className={colHeadCls}>Nach Phase</p>
                  {PILLARS.map((p) => (
                    <Link key={p.href} href={p.href} className="flex items-center gap-3 rounded-ios-sm p-2.5 transition-colors hover:bg-au-paper-warm">
                      <span className={iconChipCls}>{p.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-au-ink">{p.label}</span>
                        <span className="block text-xs text-au-ink-faint">{p.sub}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                <div>
                  <p className={colHeadCls}>Beliebte Themen</p>
                  {BELIEBT.map((b) => (
                    <Link key={b.href} href={b.href} className="block rounded-ios-sm px-3 py-[7px] text-sm text-au-ink-soft transition-colors hover:bg-au-paper-warm hover:text-au-amber">
                      {b.label}
                    </Link>
                  ))}
                </div>
              </div>
              <Link href="/#themenfelder" className="mt-2 flex items-center justify-end gap-1.5 border-t border-au-sand-dark px-3 pt-3 text-sm font-semibold text-au-amber">
                Alle Themen ansehen <ArrowRight className="h-[15px] w-[15px]" />
              </Link>
            </div>
          </div>

          {/* Werkzeuge — Dropdown */}
          <div className="group relative">
            <button type="button" aria-haspopup="true" className={triggerCls}>
              Werkzeuge <ChevronDown />
            </button>
            <div className={`${panelCls} w-[330px]`} role="menu">
              {TOOLS.map((t) => (
                <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-ios-sm p-2.5 transition-colors hover:bg-au-paper-warm">
                  <span className={iconChipCls}>{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-au-ink">{t.label}</span>
                    <span className="block text-xs text-au-ink-faint">{t.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Suche — waechst, schiebt CTA nach rechts (Desktop) */}
        <div className="ml-auto hidden w-full max-w-[330px] md:block">
          <SiteSearch variant="desktop" />
        </div>

        {/* Primaer-Aktion (Desktop) */}
        <Link
          href="/gutachter-finden"
          className="hidden flex-none items-center gap-2 rounded-full bg-au-amber px-[19px] py-[11px] text-[14.5px] font-semibold text-white transition hover:-translate-y-px hover:bg-au-amber-dark hover:shadow-au-md md:inline-flex [&_svg]:h-4 [&_svg]:w-4"
        >
          Gutachter finden <ArrowRight />
        </Link>

        {/* Mobile-Navigation (Hamburger + Overlay) */}
        <MobileNav />
      </div>
    </header>
  )
}
