import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { StickyCallBar } from './StickyCallBar'
import { HeroSection } from './sections/HeroSection'
import { HomeTrustStripSection } from './sections/HomeTrustStripSection'
import { AnsprueecheSection } from './sections/AnsprueecheSection'
import { WieEsFunktioniertSection } from './sections/WieEsFunktioniertSection'
import { BeweisSection } from './sections/BeweisSection'
import { ProduktAppSection } from './sections/ProduktAppSection'
import { MenschenSection } from './sections/MenschenSection'
import { SvFinderSection } from './sections/SvFinderSection'
import { SchadensreportSection } from './sections/SchadensreportSection'
import { FaqSection } from './sections/FaqSection'
import { BottomCtaSection } from './sections/BottomCtaSection'

type Props = {
  authenticatedUser: AuthenticatedUser | null
}

// Marketing-Home Premium-Rework — Phase B1 (Architektur-Schnitt):
// Die Home wird von 21 verstreuten Blöcken auf 12 saubere Section-Komponenten
// konsolidiert (unter ./sections/*). HauptseitePremium.tsx wird nicht mehr
// importiert (Datei bleibt bis Cleanup-Task F1 bestehen). Dieser Schnitt ist
// REIN STRUKTURELL — Content, Tokens (claimondo-*) und bestehende t('home...')-
// Keys bleiben 1:1 erhalten; Re-Keying + visueller Merge folgen in späteren Tasks.
//
// Render-Reihenfolge:
//   Topbar · Hero · TrustStrip · Ansprüche · WieEsFunktioniert · Beweis ·
//   ProduktApp · Menschen · SvFinder · Schadensreport · FAQ · BottomCta ·
//   Footer · StickyCallBar
export async function LandingPage({ authenticatedUser }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={authenticatedUser} />
      <main id="main-content" className="flex-1">
        <HeroSection />
        <HomeTrustStripSection />
        <AnsprueecheSection />
        <WieEsFunktioniertSection />
        <BeweisSection />
        <ProduktAppSection />
        <MenschenSection />
        <SvFinderSection />
        <SchadensreportSection />
        <FaqSection />
        <BottomCtaSection />
        <LandingFooter />
      </main>
      <StickyCallBar quelle="Hauptseite" />
    </div>
  )
}
