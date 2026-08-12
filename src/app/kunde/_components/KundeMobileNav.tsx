'use client'

// Bottom-only Mobile-Nav für das Kunde-Portal: geteilte MobileNav (Pille +
// Menü-Sheet). Nav-Items sind i18n-abhängig (useTranslations) → müssen client-
// seitig via buildNavItems gebaut werden. Branding/Updates/Abmelden reicht das
// Layout (server) als Slots durch.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PlusCircleIcon } from 'lucide-react'
import { MobileNav, type MobileNavItem } from '@/components/shared/mobile-nav'
import { MobileUpdatesDot } from '@/components/shared/updates/MobileUpdatesDot'
import { buildNavItems } from './KundeNav'
import { bestimmeAktivenHref } from './nav-aktiv'

const SCHADEN_HREF = '/kunde/schaden-melden'
const KUNDE_PRIMARY_HREFS = ['/kunde/termine', '/kunde/chat', '/kunde/profil']

export function KundeMobileNav({
  singleFallId = null,
  hatFirma = false,
  brandLogo,
  brandName,
  sheetTop,
  sheetFooter,
}: {
  singleFallId?: string | null
  /** B2B-Kunde mit Firmen-Konto → Flotte-Item im Menü-Sheet sichtbar (T6). */
  hatFirma?: boolean
  brandLogo?: React.ReactNode
  brandName: React.ReactNode
  sheetTop?: React.ReactNode
  sheetFooter?: React.ReactNode
}) {
  const t = useTranslations('kunde.shell')
  const tHero = useTranslations('kundeHero')
  const pathname = usePathname()

  const all: MobileNavItem[] = buildNavItems(singleFallId, t, hatFirma).map((i) => ({
    href: i.href,
    label: i.label,
    icon: i.icon,
    exact: i.exact,
  }))
  // Primär-Tabs: Mein Fall (all[0]) + Termine + Nachrichten + Profil.
  const primary = [all[0], ...KUNDE_PRIMARY_HREFS.map((h) => all.find((i) => i.href === h))]
    .filter((i): i is MobileNavItem => Boolean(i))
    .slice(0, 4)

  // Ops-Test #26: gleiche Aktiv-Regel wie in der Desktop-Sidebar — auf der kanonischen
  // Claim-Route (/kunde/fahrzeuge/[vehId]/schaden/[claimId]) gewinnt „Mein Fall".
  const aktiverHref = bestimmeAktivenHref(pathname, all, singleFallId ? `/kunde/faelle/${singleFallId}` : null)

  return (
    <MobileNav
      ariaLabel="Kunde-Navigation"
      activeHref={aktiverHref}
      primary={primary}
      sections={[{ items: all }]}
      brand={{ logo: brandLogo, name: brandName }}
      menuIndicator={<MobileUpdatesDot />}
      sheetTop={
        <>
          <Link
            href={SCHADEN_HREF}
            className="flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold text-white bg-claimondo-ondo mb-2"
          >
            <PlusCircleIcon style={{ width: 18, height: 18 }} /> {tHero('schadenMelden')}
          </Link>
          {sheetTop}
        </>
      }
      sheetFooter={sheetFooter}
    />
  )
}
