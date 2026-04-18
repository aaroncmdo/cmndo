import Link from 'next/link'

// AAR-462 F4: Topbar der öffentlichen Landing-Page.
// - Eingeloggte User sehen einen Smart-CTA „Zu meinem Portal →" (rollen-spezifisch).
// - Anonyme User sehen den klassischen „Anmelden"-Button.
export type AuthenticatedUser = {
  /** Rolle-spezifischer Portal-Pfad aus roleToPath() */
  portalPath: string
  /** Anzeige-Name (Profilname oder Email-Fallback) */
  displayName: string
}

type Props = {
  authenticatedUser: AuthenticatedUser | null
}

export function LandingTopbar({ authenticatedUser }: Props) {
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

        {authenticatedUser ? (
          <Link
            href={authenticatedUser.portalPath}
            className="inline-flex items-center gap-2 rounded-lg bg-claimondo-navy px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-claimondo-sm)] transition-colors hover:bg-claimondo-ondo"
          >
            <span className="hidden sm:inline">
              Zu meinem Portal
            </span>
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
    </header>
  )
}
