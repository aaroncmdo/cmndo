import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { HauptseiteClient } from './HauptseiteClient'
import { FounderSection } from './FounderSection'
import { BghAuthoritySection } from './BghAuthoritySection'
import { VersichererTaktikenSection } from './VersichererTaktikenSection'
import { SiebenFehlerSection } from './SiebenFehlerSection'
import { StickyCallBar } from './StickyCallBar'

type Props = {
  authenticatedUser: AuthenticatedUser | null
  locale: string
}

// AAR-883/Marketing-Premium-Rework 13.05.2026: BGH-Authority + Versicherer-
// Taktiken + 7-Fehler-Liste ergänzen die bestehende HauptseiteClient (12
// Sections) um die Wissensdatenbank-Pflichtinhalte. Reihenfolge:
// HauptseiteClient → BGH (Rechtsprechung-Authority) → VersichererTaktiken
// (Kontrast: was Versicherer tun) → 7-Fehler (Handlungs-Anweisung) →
// FounderSection (Trust-Anker) → Footer.
export async function LandingPage({ authenticatedUser, locale }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} locale={locale} />
      <main id="main-content" className="flex-1">
        <HauptseiteClient />
        <BghAuthoritySection />
        <VersichererTaktikenSection />
        <SiebenFehlerSection />
        <FounderSection />
        <LandingFooter />
      </main>
      <StickyCallBar quelle="Hauptseite" />
    </div>
  )
}
