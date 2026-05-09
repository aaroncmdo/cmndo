import Link from 'next/link'
import { LanguageSwitcher } from '@/components/shared'

// AAR-462 F4: Topbar der öffentlichen Landing-Page.
// - Eingeloggte User sehen einen Smart-CTA „Zu meinem Portal →" (rollen-spezifisch).
// - Anonyme User sehen den klassischen „Anmelden"-Button.
// AAR-463 F5: LanguageSwitcher integriert — Aktives Locale kommt aus
// getLocaleCookie() via LandingPage-Prop.
// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Schild-Icon + Wortmarke statt
// Text-Logo, dünner Hairline-Border, backdrop-blur-xl, sanfte Hover-Animations.
export type AuthenticatedUser = {
  /** Rolle-spezifischer Portal-Pfad aus roleToPath() */
  portalPath: string
  /** Anzeige-Name (Profilname oder Email-Fallback) */
  displayName: string
}

type Props = {
  authenticatedUser: AuthenticatedUser | null
  locale?: string
}

const NAV_LINKS = [
  { href: '/wie-es-funktioniert', label: 'Wie es funktioniert' },
  { href: '/vorteile', label: 'Vorteile' },
  { href: '/kfz-gutachter', label: 'Gutachter' },
  { href: '/faq', label: 'FAQ' },
  { href: '/ueber-uns', label: 'Über uns' },
] as const

export function LandingTopbar({ authenticatedUser, locale }: Props) {
  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/55"
      style={{
        WebkitBackdropFilter: 'saturate(180%) blur(24px)',
        backdropFilter: 'saturate(180%) blur(24px)',
      }}
    >
      {/* Hairline-Linie als sehr feiner Schatten unter dem Border */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(13,27,62,0.08) 50%, transparent 100%)',
        }}
      />

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo: Schild + Wortmarke. Mobile zeigt nur Schild. */}
        <Link
          href="/"
          aria-label="Claimondo Startseite"
          className="group flex items-center gap-2.5"
        >
          <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-[10px] shadow-[0_4px_12px_rgba(13,27,62,0.18)] transition-all duration-200 group-hover:shadow-[0_6px_18px_rgba(13,27,62,0.28)] group-hover:scale-[1.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/claimondo-shield.svg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
            />
          </span>
          <span className="hidden sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/claimondo-wortmarke.svg"
              alt="Claimondo"
              width={140}
              height={22}
              className="h-[22px] w-auto"
            />
          </span>
          <span className="sr-only">Claimondo</span>
        </Link>

        {/* Desktop Nav — feine Pill-Hover */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative rounded-full px-3.5 py-1.5 text-sm font-medium text-claimondo-ondo transition-all duration-200 hover:bg-claimondo-navy/5 hover:text-claimondo-navy"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher locale={locale} variant="compact" />
          {authenticatedUser ? (
            <Link
              href={authenticatedUser.portalPath}
              className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(13,27,62,0.25)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_6px_18px_rgba(13,27,62,0.35)] active:scale-[0.97]"
            >
              <span className="hidden sm:inline">Zu meinem Portal</span>
              <span className="sm:hidden">Portal</span>
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-semibold text-claimondo-navy backdrop-blur-sm transition-all duration-200 hover:border-claimondo-navy/15 hover:bg-white active:scale-[0.97]"
            >
              Anmelden
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
