import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { CommunityFeedSection } from '@/components/community/CommunityFeedSection'
import { OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'

// Eigenes Zuhause fuer den B2B-Feed. Er stand bisher NUR auf der Startseite und
// war dort mit 18.501 px der mit Abstand groesste Block: 37 % der gesamten
// Seitenhoehe mobil, 2.243 Woerter, 62 Links (gemessen 24.08.2026).
//
// Der eigentliche Grund fuer den Umzug ist aber nicht die Laenge, sondern die
// Zielgruppe: Der Feed ist fachlicher Austausch fuer Sachverstaendige, Makler
// und Werkstaetten. Die Startseite gehoert dem Unfallgeschaedigten kurz nach dem
// Schaden (PRODUCT.md). Der scrollte bislang durch 28 Bildschirme B2B-Diskussion,
// bevor er die FAQ erreichte.
//
// Auf der Startseite bleibt ein Teaser mit den neuesten Beitraegen und einem
// Verweis hierher — es geht nichts verloren, es steht nur am richtigen Ort.

export async function generateMetadata(): Promise<Metadata> {
  const titel = 'Community für Sachverständige, Makler und Werkstätten'
  const beschreibung =
    'Fachlicher Austausch rund um Kfz-Schadenregulierung: Urteile, Honorarfragen, Praxis aus der Begutachtung. Beiträge von Sachverständigen, Maklern und Werkstätten.'
  return {
    title: titel,
    description: beschreibung,
    alternates: await localeAlternates('/community'),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',
      ...(await localeOpenGraph('/community')),
      title: titel,
      description: beschreibung,
      images: OG_DEFAULT_IMAGES,
    },
  }
}

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />
      <main>
        <nav aria-label="Brotkrumen" className="mx-auto max-w-6xl px-4 pt-8 text-xs text-claimondo-shield/70 sm:px-6">
          <Link href="/" className="hover:text-claimondo-navy">
            Start
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-claimondo-navy">Community</span>
        </nav>
        <CommunityFeedSection />
      </main>
      <LandingFooter />
    </div>
  )
}
