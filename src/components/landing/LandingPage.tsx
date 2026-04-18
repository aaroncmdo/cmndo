import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { LandingHero } from './LandingHero'

// AAR-462 F4 → AAR-464 L1: Öffentliche Landing-Page. Die Hero-Section
// wurde in `LandingHero` extrahiert (Server-Component + next-intl).
// Weitere Sektionen (Trust, 3-Schritte, DAT-Teaser, SEO) folgen in den
// nachfolgenden Phase-4-Tickets (AAR-465 ff).
type Props = {
  authenticatedUser: AuthenticatedUser | null
  /** Aktuelles User-Locale aus getLocaleCookie() — LanguageSwitcher-Prop */
  locale: string
}

export async function LandingPage({ authenticatedUser, locale }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} locale={locale} />

      <main id="main-content" className="flex-1">
        <LandingHero authenticatedUser={authenticatedUser} />

        <LandingFooter />
      </main>
    </div>
  )
}
