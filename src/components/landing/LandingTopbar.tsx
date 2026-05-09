import Link from 'next/link'
import { LanguageSwitcher } from '@/components/shared'

// AAR-462 F4: Topbar der öffentlichen Landing-Page.
// - Eingeloggte User sehen einen Smart-CTA „Zu meinem Portal →" (rollen-spezifisch).
// - Anonyme User sehen den klassischen „Anmelden"-Button.
// AAR-463 F5: LanguageSwitcher integriert — Aktives Locale kommt aus
// getLocaleCookie() via LandingPage-Prop.
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

export function LandingTopbar({ authenticatedUser, locale }: Props) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-claimondo-border bg-claimondo-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Claimondo Startseite"
          className="flex items-center gap-2"
        >
          <span className="text-xl font-bold tracking-tight text-claimondo-navy">
            Claimondo
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-claimondo-ondo md:flex">
          <Link href="/wie-es-funktioniert" className="transition-colors hover:text-claimondo-navy">Wie es funktioniert</Link>
          <Link href="/vorteile" className="transition-colors hover:text-claimondo-navy">Vorteile</Link>
          <Link href="/kfz-gutachter" className="transition-colors hover:text-claimondo-navy">Gutachter</Link>
          <Link href="/faq" className="transition-colors hover:text-claimondo-navy">FAQ</Link>
          <Link href="/ueber-uns" className="transition-colors hover:text-claimondo-navy">Über uns</Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher locale={locale} variant="compact" />
          {authenticatedUser ? (
            <Link
              href={authenticatedUser.portalPath}
              className="inline-flex items-center gap-2 rounded-lg bg-claimondo-navy px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-claimondo-sm)] transition-colors hover:bg-claimondo-ondo"
            >
              <span className="hidden sm:inline">Zu meinem Portal</span>
              <span className="sm:hidden">Portal</span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-claimondo-border bg-claimondo-card px-4 py-2 text-sm font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg"
            >
              Anmelden
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
