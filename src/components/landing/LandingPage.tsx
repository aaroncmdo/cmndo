import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { HauptseiteClient } from './HauptseiteClient'
import { FounderSection } from './FounderSection'
import { StickyCallBar } from './StickyCallBar'

type Props = {
  authenticatedUser: AuthenticatedUser | null
  locale: string
}

export async function LandingPage({ authenticatedUser, locale }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} locale={locale} />
      <main id="main-content" className="flex-1">
        <HauptseiteClient />
        <FounderSection />
        <LandingFooter />
      </main>
      <StickyCallBar quelle="Hauptseite" />
    </div>
  )
}
