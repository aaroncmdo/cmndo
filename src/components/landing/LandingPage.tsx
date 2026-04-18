import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { LandingHero } from './LandingHero'
import { LandingTrust } from './LandingTrust'
import { LandingSteps } from './LandingSteps'

// AAR-462 F4 → AAR-464 L1 → AAR-465 L2: Öffentliche Landing-Page.
// Reihenfolge: Topbar → Hero → Trust → Steps → Footer.
// Weitere Sektionen (DAT-Teaser, SEO-Block) folgen in AAR-466 ff.
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
        <LandingTrust />
        <LandingSteps />

        <LandingFooter />
      </main>
    </div>
  )
}
