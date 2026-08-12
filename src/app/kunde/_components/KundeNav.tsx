'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bestimmeAktivenHref } from './nav-aktiv'
// #2 (Flotte, CarIcon) + #1 (Schaden melden, PlusCircleIcon) beim Rebase zusammengefuehrt.
import { HomeIcon, MessageSquareIcon, UserIcon, SearchIcon, CalendarIcon, CarIcon, CarFrontIcon, PlusCircleIcon } from 'lucide-react'

// CMM-28: Fall-Item dynamisch — bei Single-Fall direkt zur Detail-Page
// und Label „Mein Fall" (statt „Meine Fälle" + Auto-Redirect-Flicker).
// T6 (08.08.): `hatFirma` gatet das Flotte-Item — Flotte ist ein B2B-Feature; ohne
// Firmen-Konto lief `/kunde/flotte` als "Firmen-Konto anlegen"-Formular fuer jeden
// Privatkunden auf (Aaron: "Flotte gehört zu B2B-Kunden"). Default false = versteckt.
export function buildNavItems(singleFallId: string | null, t: (key: string) => string, hatFirma = false) {
  const fallItem = singleFallId
    ? { href: `/kunde/faelle/${singleFallId}`, label: t('nav.meinFall'), icon: HomeIcon, exact: false }
    : { href: '/kunde', label: t('nav.meineFaelle'), icon: HomeIcon, exact: true }
  return [
    fallItem,
    { href: '/kunde/termine', label: t('nav.termine'), icon: CalendarIcon, exact: false },
    { href: '/kunde/nachbesichtigung', label: t('nav.nachbesichtigung'), icon: SearchIcon, exact: false },
    // P6 (WS H, fahrzeug-zentrisch): eigene Fahrzeuge (owner-scoped) — vor der firma-scoped Flotte.
    // TODO i18n-Follow-up: nav.fahrzeuge-Key in den 6 Locales; hardcoded DE wie beim Flotte-Item.
    { href: '/kunde/fahrzeuge', label: 'Fahrzeuge', icon: CarFrontIcon, exact: false },
    // Sub-Projekt 2 (Firma & Flotte): NUR fuer B2B-Kunden mit Firmen-Konto (T6).
    // TODO i18n-Follow-up: nav.flotte-Key in den 6 Locales; hardcoded DE reicht fuer den MVP-Ship.
    ...(hatFirma ? [{ href: '/kunde/flotte', label: 'Flotte', icon: CarIcon, exact: false }] : []),
    { href: '/kunde/chat', label: t('nav.nachrichten'), icon: MessageSquareIcon, exact: false },
    { href: '/kunde/profil', label: t('nav.profil'), icon: UserIcon, exact: false },
  ]
}

export default function KundeNav({
  singleFallId = null,
  hatFirma = false,
}: {
  /** Wenn der Kunde nur einen Fall hat: faelle.id direkt durchreichen, damit
   *  die Nav direkt zur Detail-Page linkt statt zum Dashboard mit Liste. */
  singleFallId?: string | null
  /** B2B-Kunde mit Firmen-Konto → Flotte-Item sichtbar (T6). */
  hatFirma?: boolean
}) {
  const pathname = usePathname()
  const t = useTranslations('kunde.shell')
  // Sub-Projekt 1 (Kunde-Portal 1+): prominenter "Schaden melden"-Einstieg — auf
  // jeder Kunde-Seite erreichbar. Label reuse aus kundeHero (existiert in allen 6
  // Locales) → kein neuer i18n-Key noetig.
  const tHero = useTranslations('kundeHero')
  const SCHADEN_HREF = '/kunde/schaden-melden'
  const NAV_ITEMS = buildNavItems(singleFallId, t, hatFirma)

  // Ops-Test #26: Genau EIN Eintrag ist aktiv — inkl. der kanonischen Claim-Route
  // unter /kunde/fahrzeuge/[vehId]/schaden/[claimId], wo vorher faelschlich
  // „Fahrzeuge" markiert wurde. Regel + Tests in ./nav-aktiv.
  const fallHref = singleFallId ? `/kunde/faelle/${singleFallId}` : null
  const aktiverHref = bestimmeAktivenHref(pathname, NAV_ITEMS, fallHref)

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  // Desktop-Sidebar-Nav (Mobile läuft über die geteilte KundeMobileNav/MobileNav).
  return (
    <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
      {/* Sub-Projekt 1: prominenter "Schaden melden"-CTA (accent), immer erreichbar. */}
      <Link
        href={SCHADEN_HREF}
        className={`mt-3 mb-1 flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold transition-colors duration-500 ${
          isActive(SCHADEN_HREF) ? 'bg-white text-claimondo-navy' : 'bg-claimondo-ondo text-white hover:bg-claimondo-ondo/90'
        }`}
      >
        <PlusCircleIcon style={{ width: 17, height: 17 }} />
        {tHero('schadenMelden')}
      </Link>
      <p className="text-[10px] uppercase tracking-wider text-claimondo-light-blue px-3 pt-4 pb-2">{t('nav.heading')}</p>
      {NAV_ITEMS.map(item => {
        const active = item.href === aktiverHref
        return (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors duration-500 ${
              active ? 'bg-claimondo-ondo text-white font-semibold' : 'text-claimondo-light-blue hover:bg-claimondo-shield hover:text-white'
            }`}>
            <item.icon style={{ width: 17, height: 17 }} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
