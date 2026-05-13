import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { HauptseitePremium } from './HauptseitePremium'
import { VersichererTaktikenSection } from './VersichererTaktikenSection'
import { SiebenFehlerSection } from './SiebenFehlerSection'
import { FounderSection } from './FounderSection'
import { StickyCallBar } from './StickyCallBar'

type Props = {
  authenticatedUser: AuthenticatedUser | null
  locale: string
}

// Marketing-Premium-Rework 13.05.2026: HauptseitePremium ersetzt die alte
// 1050-LOC-HauptseiteClient durch eine fokussierte 10-Section-Page nach dem
// Köln-Handoff-Prototype (IMPLEMENTIERUNGSPLAN.md + KfzGutachterKoelnLanding.tsx).
// VersichererTaktikenSection + SiebenFehlerSection ergänzen die Wissensdatenbank-
// Inhalte (§2, §12, §15) zwischen Premium-Page und Founder-Trust-Anker.
export async function LandingPage({ authenticatedUser, locale }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} locale={locale} />
      <main id="main-content" className="flex-1">
        <HauptseitePremium />
        <VersichererTaktikenSection />
        <SiebenFehlerSection />
        <FounderSection />
        <LandingFooter />
      </main>
      <StickyCallBar quelle="Hauptseite" />
    </div>
  )
}
