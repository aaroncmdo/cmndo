import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { LandingHero } from './LandingHero'
import { LandingTrust } from './LandingTrust'
import { LandingSteps } from './LandingSteps'
import { LandingDatTeaser } from './LandingDatTeaser'
import { LandingSeoContent } from './LandingSeoContent'

// AAR-462 F4 → AAR-464 L1 → AAR-465 L2 → AAR-466 L3: Öffentliche
// Landing-Page. Reihenfolge: Topbar → Hero → Trust → Steps →
// DAT-Teaser → SEO-Content → Footer.
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
        <LandingDatTeaser />
        <LandingSeoContent />

        <LandingFooter />
      </main>
    </div>
  )
}
