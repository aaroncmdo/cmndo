import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { HauptseiteClient } from './HauptseiteClient'

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
        <LandingFooter />
      </main>
    </div>
  )
}
