import { Suspense } from 'react'
import { LandingTopbar, type AuthenticatedUser } from './LandingTopbar'
import { LandingFooter } from './LandingFooter'
import { StickyCallBar } from './StickyCallBar'
import { WHATSAPP_HREF } from '@/lib/seo/jsonld'
import { HeroSection } from './sections/HeroSection'
import { HomeTrustStripSection } from './sections/HomeTrustStripSection'
import { AnsprueecheSection } from './sections/AnsprueecheSection'
import { WieEsFunktioniertSection } from './sections/WieEsFunktioniertSection'
import { KostenTransparenzSection } from './sections/KostenTransparenzSection'
import { BeweisSection } from './sections/BeweisSection'
import { ProduktAppSection } from './sections/ProduktAppSection'
import { MenschenSection } from './sections/MenschenSection'
import { SvFinderSection } from './sections/SvFinderSection'
import { SchadensreportSection } from './sections/SchadensreportSection'
import { FaqSection } from './sections/FaqSection'
import { BottomCtaSection } from './sections/BottomCtaSection'
import { WissensRatgeberSection } from './sections/WissensRatgeberSection'
import { VerfuegbarkeitStreifen } from './sections/VerfuegbarkeitStreifen'
import { NaechsteTermineKompakt } from '../content/NaechsteTermineKompakt'
import { CommunityTeaserSection } from '../community/CommunityTeaserSection'

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
      <main className="flex-1">  {/* id="main-content" liegt jetzt in LandingTopbar (dort fuer ALLE Seiten) */}
        <HeroSection />
        <HomeTrustStripSection />
        {/* Freie Termine im HTML — die Startseite ist laut Zugriffslog die meistgelesene
            Seite der KI-Crawler (26 Abrufe/14 h) und trug bis 24.08.2026 keine einzige
            Aussage zur Verfuegbarkeit. Rendert `null`, wenn nirgends etwas frei ist.

            ⚠ SUSPENSE ist hier PFLICHT, nicht Kosmetik: gemessen am 24.08. kostet der
            KALTE Abruf der fuenf Staedte 3,23 s (warm 0,11 s). Ohne Grenze haenge daran
            der TTFB der wichtigsten Seite des Hauses — auch wenn es nur den ersten Aufruf
            je Cache-Fenster traefe. Mit Suspense rendert die Seite sofort; der Streifen
            kommt im SELBEN HTTP-Response nach (Streaming-SSR, kein Client-Fetch), steht
            also weiterhin im HTML, das ein Crawler liest. Genau das ist das Regel-4-
            Kriterium nach dem Deploy. */}
        <Suspense fallback={null}>
          <VerfuegbarkeitStreifen />
        </Suspense>
        <AnsprueecheSection />
        <WieEsFunktioniertSection />
        <KostenTransparenzSection />
        <BeweisSection />
        <ProduktAppSection />
        <MenschenSection />
        <SvFinderSection />
        <SchadensreportSection />
        <WissensRatgeberSection />
        <CommunityTeaserSection />
        <FaqSection />
        <BottomCtaSection />
        {/* Die buchbaren URLs als sichtbarer TEXT — dasselbe Muster wie am Ende der
            ~30 Ratgeber-Seiten.

            Warum zusaetzlich zum VerfuegbarkeitStreifen oben: der Streifen nennt Stadt,
            Tag und Gutachter, seine URL steckt aber im `href`. Ein LLM-Web-Tool ersetzt
            `<a href>` durch eine nummerierte Referenz und verliert den Zielwert — gemessen
            am 28.08.: im ausgelieferten TEXT der Startseite stand keine einzige buchbare
            URL. Fuer 3 x ~125 Zeichen ist der schmale Streifen der falsche Ort, das
            Seitenende der richtige. (Zahlen-Vorbehalt zur Abruf-Haeufigkeit siehe
            VerfuegbarkeitStreifen.tsx — ein gemeinsames access.log ohne Host-Feld.)

            Rendert `null`, wenn nichts frei ist. */}
        <div className="mx-auto max-w-3xl px-5 pb-8">
          <Suspense fallback={null}>
            <NaechsteTermineKompakt />
          </Suspense>
        </div>
        <LandingFooter />
      </main>
      {/* whatsappHref: die Leiste rendert den WhatsApp-Knopf nur, wenn sie ihn
          bekommt. 23 Content-Seiten uebergeben ihn, die Startseite bisher
          als einzige nicht — eine Luecke, keine Entscheidung (Aaron 25.08.). */}
      <StickyCallBar quelle="Hauptseite" whatsappHref={WHATSAPP_HREF} />
    </div>
  )
}
