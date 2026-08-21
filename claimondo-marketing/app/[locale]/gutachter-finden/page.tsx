import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
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
      images: OG_DEFAULT_IMAGES,
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
// Ziele des Crawl-Pfads: der Pillar, seine drei Themen-Spokes und die sieben
// Hub-Staedte (die mit hyperlocaler Tiefe, `HYPERLOCAL_DATA` in staedte.ts).
// Bewusst kurz gehalten — ein Navigations-Block, keine Linkliste.
const FINDER_LINKS = [
  { href: '/kfz-gutachter', label: 'Kfz-Gutachter' },
  { href: '/kfz-gutachter/kosten', label: 'Kosten' },
  { href: '/kfz-gutachter/ablauf', label: 'Ablauf' },
  { href: '/kfz-gutachter/wertminderung', label: 'Wertminderung' },
  { href: '/kfz-gutachter/koeln', label: 'Köln' },
  { href: '/kfz-gutachter/duesseldorf', label: 'Düsseldorf' },
  { href: '/kfz-gutachter/bonn', label: 'Bonn' },
  { href: '/kfz-gutachter/wuppertal', label: 'Wuppertal' },
  { href: '/kfz-gutachter/hamburg', label: 'Hamburg' },
  { href: '/kfz-gutachter/berlin', label: 'Berlin' },
  { href: '/kfz-gutachter/muenchen', label: 'München' },
] as const

export default async function GutachterFindenPage({
  searchParams,
}: {
  searchParams: Promise<{
    stadt?: string; plz?: string; lat?: string; lng?: string
    // AAR-956: Google-Ads-Click-IDs (Ad-Klick landet auf dieser Parent-URL) → an den
    // Embed-iframe weiterreichen, damit der Conversion-Linker im Container _gcl_aw schreibt.
    gclid?: string; gbraid?: string; wbraid?: string; gclsrc?: string
    // GEO-Deep-Link: `?sv=<profiles.id>` — der Gutachter, den eine KI-Antwort bereits
    // genannt hat (aus `gutachter[].buchungs_url` der oeffentlichen Termin-API). Wird an
    // den Embed durchgereicht und dort NUR als Vorauswahl genutzt.
    sv?: string
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

      {/* Finder-Karte. initialCenter aus ?stadt/?plz/?lat&lng.
          Embed-only: bewusst KEIN Marketing-Content darunter (Trust-Strip, FAQ,
          Bottom-CTA) — der erzeugte auf Mobil den Scroll-Konflikt (AAR-956).
          Die Hoehe laesst bewusst 5rem frei: der sichtbare Anschnitt des
          Link-Blocks signalisiert, dass es weitergeht, statt Content hinter
          einer randlosen 100dvh-Karte zu verstecken. */}
      <GutachterFindenSection
        height="calc(100dvh - 5rem)"
        initialCenter={initialCenter}
        clickIds={{ gclid: sp.gclid, gbraid: sp.gbraid, wbraid: sp.wbraid, gclsrc: sp.gclsrc }}
        svId={sp.sv}
      />

      {/* Crawl-Pfad. Die Seite lieferte zuvor 0 Woerter und 0 interne Links —
          eine Sackgasse: sie nimmt Link-Equity auf (priority 0.95) und gibt
          nichts weiter. Bewusst nur Navigation, kein Fliesstext: die
          Content-Tiefe liegt im Pillar /kfz-gutachter (1.711 Woerter).
          Labels sind Seiten-/Ortsnamen und bleiben deutsch — wie die Ziele
          und wie die uebrigen internen Links des Builds (next/link,
          prefix-frei, etablierte Praxis der Stadtseiten). */}
      <nav
        aria-label="Weitere Seiten zu Kfz-Gutachtern"
        className="flex h-20 items-center overflow-x-auto border-t border-claimondo-border bg-claimondo-bg px-4 sm:px-6"
      >
        <ul className="flex items-center gap-x-3 gap-y-1 whitespace-nowrap text-body-sm text-claimondo-shield/80">
          {FINDER_LINKS.map((l, i) => (
            <Fragment key={l.href}>
              {i > 0 && (
                <li aria-hidden className="text-claimondo-shield/30">
                  ·
                </li>
              )}
              <li>
                <Link
                  href={l.href}
                  className="underline-offset-2 transition-colors hover:text-claimondo-ondo hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            </Fragment>
          ))}
        </ul>
      </nav>
    </>
  )
}
