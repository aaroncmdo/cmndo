import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GutachterFindenSection } from '@/components/gutachter-finden/GutachterFindenSection'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'
import { geocodeAdresse } from '@/lib/mapbox/geocode'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gutachter_finden.title'),
    description: t('gutachter_finden.description'),
    keywords: [
      'Kfz-Gutachter finden',
      'Sachverständiger in der Nähe',
      'Unfallgutachter',
      'Kfz-Sachverständiger Karte',
      'Kfz-Sachverständiger Köln',
      'Kfz-Sachverständiger Düsseldorf',
      'Kfz-Sachverständiger NRW',
      'unabhängiger Gutachter',
      'Schadensgutachten Termin',
      'Wertminderung berechnen',
      'Karte Sachverständige',
      'Gutachter Suche bundesweit',
    ],
    alternates: await localeAlternates('/gutachter-finden'),
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',

      images: OG_DEFAULT_IMAGES,
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

// AAR-956 (Aaron 16.06.): /gutachter-finden ist jetzt EMBED-ONLY — der Vollbild-Finder
// (100dvh) OHNE den Marketing-Content darunter (Trust-Strip, BGH-Authority, FAQ, Bottom-
// CTA), der auf Mobil mit der touch-fangenden 100dvh-Karte einen unsauberen Scroll-Konflikt
// erzeugte. Die SEO-Wirkung bleibt erhalten: Metadata (Title/Description/Keywords/OG/Twitter),
// JSON-LD (Service/Breadcrumb/ImageObject) und die sr-only-H1 beschreiben die Seite weiterhin
// crawler-lesbar. FAQ-/HowTo-JSON-LD wurde entfernt, weil deren SICHTBARER Inhalt wegfällt
// (Google verlangt sichtbaren Content für FAQ-/HowTo-Rich-Results).
export default async function GutachterFindenPage({
  searchParams,
}: {
  searchParams: Promise<{
    stadt?: string; plz?: string; lat?: string; lng?: string
    // AAR-956: Google-Ads-Click-IDs (Ad-Klick landet auf dieser Parent-URL) → an den
    // Embed-iframe weiterreichen, damit der Conversion-Linker im Container _gcl_aw schreibt.
    gclid?: string; gbraid?: string; wbraid?: string; gclsrc?: string
  }>
}) {
  const t = await getTranslations('gutachter_finden')
  const sp = await searchParams

  // Karte auf URL-Param vorzentrieren — ?lat&lng direkt, sonst ?plz / ?stadt server-seitig
  // via Mapbox geocoden. Kein Param -> null -> Client nutzt NRW-Default + Geolocation.
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung über interaktive Karte',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen über interaktive Karte. Geprüfte, unabhängige Kfz-Sachverständige, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
          // ImageObject macht die Static-Map-API maschinen-lesbar zitierbar
          // (Google-Rich-Image + AI-Crawler-Pointer auf die Karte).
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
      <h1 className="sr-only">{t('sr_h1')}</h1>

      {/* Vollbild-Finder (Karte + Finder + Wizard). initialCenter aus ?stadt/?plz/?lat&lng.
          Embed-only: bewusst KEIN Content darunter (sauberer Mobile-Scroll). */}
      <GutachterFindenSection
        height="100dvh"
        initialCenter={initialCenter}
        clickIds={{ gclid: sp.gclid, gbraid: sp.gbraid, wbraid: sp.wbraid, gclsrc: sp.gclsrc }}
      />
    </>
  )
}
