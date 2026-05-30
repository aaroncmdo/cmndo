import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { GutachterFindenSection } from '@/components/gutachter-finden/GutachterFindenSection'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gutachter_finden.title'),
    description: t('gutachter_finden.description'),
    keywords: [
      'Kfz-Gutachter finden',
      'Sachverständiger in der Nähe',
      'Unfallgutachter',
      'DAT-Experte Karte',
      'Kfz-Sachverständiger Köln',
      'Kfz-Sachverständiger Düsseldorf',
      'Kfz-Sachverständiger NRW',
      'unabhängiger Gutachter',
      'Schadensgutachten Termin',
      'Wertminderung berechnen',
      'Karte Sachverständige',
      'Gutachter Suche bundesweit',
    ],
    alternates: {
      canonical: `${SITE_URL}/gutachter-finden`,
      ...buildLanguageAlternates('/gutachter-finden'),
    },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/gutachter-finden`,
      title: t('gutachter_finden.og_title'),
      description: t('gutachter_finden.og_description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('gutachter_finden.twitter_title'),
      description: t('gutachter_finden.twitter_description'),
    },
  }
}

// Seite = <GutachterFindenSection variant="full"> (Vollbild-Karte + Finder +
// Wizard-Toggle, ausgelagert/wiederverwendbar) + Premium-Content unterhalb
// (Trust-Strip, BGH-Authority, FAQ, Bottom-CTA). SEO-H1 als sr-only.
// Die Section ist auch auf anderen Marketing-Seiten platzierbar
// (variant='full' mit height=… ODER variant='teaser').
export default async function GutachterFindenPage({
  searchParams,
}: {
  searchParams: Promise<{ stadt?: string; plz?: string; lat?: string; lng?: string }>
}) {
  const t = await getTranslations('gutachter_finden')
  const sp = await searchParams

  // Doc 34 0a.3: Karte auf URL-Param vorzentrieren — ?lat&lng direkt, sonst
  // ?plz / ?stadt server-seitig via Mapbox geocoden. Kein Param -> null ->
  // Client nutzt NRW-Default + Geolocation (bisheriges Verhalten).
  let initialCenter: { lat: number; lng: number } | null = null
  const latNum = sp.lat ? Number(sp.lat) : NaN
  const lngNum = sp.lng ? Number(sp.lng) : NaN
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    initialCenter = { lat: latNum, lng: lngNum }
  } else {
    const query = sp.plz?.trim() || sp.stadt?.trim()
    if (query) {
      const geo = await geocodeAdresse(query)
      if (geo) initialCenter = { lat: geo.lat, lng: geo.lng }
    }
  }

  const kpis = t.raw('kpis') as Array<{ wert: string; label: string }>
  const kpiMethodik = t('kpi_methodik')
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>
  const howtoSteps = t.raw('howto_steps') as Array<{ nr: number; name: string; text: string }>

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung über interaktive Karte',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen über interaktive Karte. Zertifizierte Partner-Sachverständige aus dem öffentlichen DAT-Verzeichnis, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Kfz-Gutachter über interaktive Karte finden und Termin buchen',
            description:
              'In vier Schritten zum Termin: Karte öffnen, Marker auswählen, Wizard ausfüllen, Bestätigung erhalten. Ø Buchungsdauer: unter 5 Minuten.',
            totalTime: 'PT5M',
            step: howtoSteps.map((s) => ({
              '@type': 'HowToStep',
              position: s.nr,
              name: s.name,
              text: s.text,
            })),
          },
          faqPageSchema(faqs),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
          // Doc 34 0a.4: ImageObject macht die Static-Map-API maschinen-lesbar
          // zitierbar — Google-Rich-Image + AI-Crawler-Pointer auf die Karte.
          {
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            contentUrl: `${SITE_URL}/api/v1/karte/50670.png`,
            description:
              'Karte der Claimondo-Partner-Sachverständigen — pro deutscher Postleitzahl alle Partner im 30-km-Radius. Beispiel Köln (50670); jede gültige 5-stellige PLZ unter /api/v1/karte/[PLZ].png.',
            width: 1600,
            height: 1200,
            encodingFormat: 'image/png',
            acquireLicensePage: `${SITE_URL}/gutachter-finden`,
          },
        ])}
      />
      <h1 className="sr-only">
        {t('sr_h1')}
      </h1>

      {/* Vollbild-Finder als wiederverwendbare Section (Karte + Finder +
          Wizard-Toggle mit App-Link). initialCenter aus ?stadt/?plz/?lat&lng. */}
      <GutachterFindenSection variant="full" height="100dvh" initialCenter={initialCenter} />

      {/* Premium-Polish 2026-05-14: scroll-bare Section unterhalb der Karte
          mit Trust-Strip, BGH-Authority, FAQ und Bottom-CTA. Karten-UX
          oberhalb unverändert (100 dvh) — User scrollt nach unten für mehr
          Kontext. Crawler indexieren beides. */}
      <TrustStripSection kpis={kpis} methodikNote={kpiMethodik} />

      <BghAuthorityGrid
        headingId="gutachter-finden-bgh"
        subline=" Egal ob Sie den Gutachter über die Karte buchen oder direkt anrufen — alle Partner-SVs arbeiten BGH-konform."
      />

      {/* FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="gutachter-finden-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq_section.eyebrow')}
            </p>
            <h2 id="gutachter-finden-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq_section.heading')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.frage} className="group rounded-2xl border border-claimondo-border bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-claimondo-navy">
                  <span>{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            {t('bottom_cta.heading')}
          </h2>
          <p className="mt-4 text-white/75">
            {t('bottom_cta.sub')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-gutachter-finden-melden"
            >
              {t('bottom_cta.cta_melden')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
              data-tracking="call-gutachter-finden-bottom"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking="whatsapp-gutachter-finden-bottom"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              {t('bottom_cta.cta_whatsapp')}
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
