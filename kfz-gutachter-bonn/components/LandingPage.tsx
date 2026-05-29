import type { City } from '@/lib/cluster'
import { JsonLd } from './JsonLd'
import { localBusinessSchema, faqSchema, breadcrumbSchema } from '@/lib/schema'
import { Header } from './Header'
import { HeroSection } from './HeroSection'
import { ReviewsSection } from './ReviewsSection'
import { AblaufSection } from './AblaufSection'
import { NetzwerkSection } from './NetzwerkSection'
import { LeistungenSection } from './LeistungenSection'
import { UeberUnsSection } from './UeberUnsSection'
import { EinsatzgebietSection } from './EinsatzgebietSection'
import { FaqAccordion } from './FaqAccordion'
import { RatgeberSection } from './RatgeberSection'
import { FinalCta } from './FinalCta'
import { Footer } from './Footer'
import { FabStack } from './FabStack'
import { MonikaEmbedSlot } from './MonikaEmbedSlot'
import { SiteScripts } from './SiteScripts'

// Integrations-Vertrag: Komposition aller Sektionen. Hub-Page (/) und
// Spoke-Pages (/lp/[slug]/) rendern dieselbe LandingPage mit unterschiedlicher
// `city`. Section-Komponenten rendern jeweils ihr eigenes <section> (mit der
// im Mock vergebenen id, wo vorhanden). Reihenfolge = Mock.
export function LandingPage({ city, route }: { city: City; route: 'hub' | 'spoke' }) {
  return (
    <>
      <JsonLd data={localBusinessSchema(city, route)} />
      <JsonLd data={faqSchema(city)} />
      <JsonLd data={breadcrumbSchema(city, route)} />

      <a
        href="#main-content"
        className="absolute left-[-9999px] top-auto w-px h-px overflow-hidden z-[999] focus:left-4 focus:top-4 focus:w-auto focus:h-auto focus:px-4 focus:py-2 focus:bg-surface focus:text-ink focus:rounded-cta focus:shadow-md"
      >
        Zum Hauptinhalt springen
      </a>

      <Header />

      <main id="main-content">
        <HeroSection city={city} />
        <ReviewsSection city={city} />
        <AblaufSection />
        <NetzwerkSection />
        <LeistungenSection />
        <UeberUnsSection city={city} />
        <EinsatzgebietSection city={city} />
        <FaqAccordion city={city} />
        <RatgeberSection />
        <FinalCta city={city} />
      </main>

      <Footer city={city} />
      <FabStack city={city} />
      <MonikaEmbedSlot city={city} />
      <SiteScripts citySlug={city.slug} />
    </>
  )
}
