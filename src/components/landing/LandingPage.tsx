import Link from 'next/link'
import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'

// AAR-462 F4: Skeleton der öffentlichen Landing-Page.
// Diese Version liefert das Grundgerüst (Topbar + Hero + Footer). Die
// inhaltsreichen Sektionen (Value-Props, Use-Cases, Testimonials,
// CTA-Flows) kommen in den Phase-4-Tickets AAR-464 / AAR-465 / AAR-466.
// Wichtig: Die Seite rendert identisch für anonyme und eingeloggte User —
// nur der CTA in der Topbar passt sich an.
type Props = {
  authenticatedUser: AuthenticatedUser | null
  /** Aktuelles User-Locale aus getLocaleCookie() — zukünftige i18n-Hook-Stelle */
  locale: string
}

export function LandingPage({ authenticatedUser, locale: _locale }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} />

      <main id="main-content" className="flex-1">
        <section
          className="relative overflow-hidden bg-gradient-to-b from-claimondo-card to-claimondo-bg"
          aria-labelledby="hero-heading"
        >
          <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
            <span className="inline-flex items-center rounded-full border border-claimondo-border bg-claimondo-card px-3 py-1 text-xs font-semibold uppercase tracking-widest text-claimondo-ondo">
              KFZ-Schadensmanagement
            </span>

            <h1
              id="hero-heading"
              className="mt-6 text-4xl font-bold leading-tight tracking-tight text-claimondo-navy sm:text-5xl md:text-6xl"
            >
              Kfz-Schaden gemeldet —
              <br className="hidden sm:block" />
              wir übernehmen den Rest.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Claimondo regelt Ihren Unfallschaden unabhängig von der
              gegnerischen Versicherung. Gutachten, Werkstatt, Anwalt und
              Auszahlung — alles aus einer Hand und transparent nachvollziehbar.
            </p>

            <div className="mt-10 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              {authenticatedUser ? (
                <Link
                  href={authenticatedUser.portalPath}
                  className="inline-flex items-center justify-center rounded-lg bg-claimondo-navy px-6 py-3 text-base font-semibold text-white shadow-[var(--shadow-claimondo-md)] transition-colors hover:bg-claimondo-ondo"
                >
                  Weiter zu meinem Portal →
                </Link>
              ) : (
                <>
                  <Link
                    href="/flow/start"
                    className="inline-flex items-center justify-center rounded-lg bg-claimondo-navy px-6 py-3 text-base font-semibold text-white shadow-[var(--shadow-claimondo-md)] transition-colors hover:bg-claimondo-ondo"
                  >
                    Schaden jetzt melden
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-lg border border-claimondo-border bg-claimondo-card px-6 py-3 text-base font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg"
                  >
                    Anmelden
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <LandingFooter />
      </main>
    </div>
  )
}
