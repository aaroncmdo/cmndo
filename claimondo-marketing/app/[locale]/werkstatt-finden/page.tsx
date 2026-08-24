import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { WerkstattFindenSection } from '@/components/werkstatt-finden/WerkstattFindenSection'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'
import { geocodeAdresse } from '@/lib/mapbox/geocode'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('werkstatt_finden.title'),
    description: t('werkstatt_finden.description'),
    keywords: [
      'Kfz-Werkstatt finden',
      'Werkstatt in der Nähe',
      'Unfallreparatur Werkstatt',
      'Karosserie und Lack',
      'Smart Repair',
      'Werkstatt Köln',
      'Werkstatt Düsseldorf',
      'Werkstatt NRW',
      'freie Werkstatt',
      'Reparatur nach Unfall',
      'Kostenvoranschlag Werkstatt',
      'Werkstatt Termin online',
    ],
    alternates: await localeAlternates('/werkstatt-finden'),
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',

      images: OG_DEFAULT_IMAGES,
      url: `${SITE_URL}/werkstatt-finden`,
      title: t('werkstatt_finden.og_title'),
      description: t('werkstatt_finden.og_description'),
    },
    twitter: {
      card: 'summary_large_image',
      images: OG_DEFAULT_IMAGES,
      title: t('werkstatt_finden.twitter_title'),
      description: t('werkstatt_finden.twitter_description'),
    },
  }
}

// #18 P4 — Entry-Point für den Werkstatt-Finder-Embed. Analog /gutachter-finden (AAR-956):
// EMBED-ONLY — der Vollbild-Finder (100dvh) OHNE Marketing-Content darunter (die touch-
// fangende 100dvh-Karte erzeugt sonst auf Mobil einen unsauberen Scroll-Konflikt). SEO läuft
// über Metadata + JSON-LD (Service/Breadcrumb) + die sr-only-H1.
export default async function WerkstattFindenPage({
  searchParams,
}: {
  searchParams: Promise<{
    stadt?: string; plz?: string; lat?: string; lng?: string
    // Google-Ads-Click-IDs (Ad-Klick landet auf dieser Parent-URL) → an den Embed-iframe
    // weiterreichen, damit der Conversion-Linker im Container _gcl_aw schreibt.
    gclid?: string; gbraid?: string; wbraid?: string; gclsrc?: string
    // Makler-/Partner-Promo-Code → Provision-Attribution am entstehenden Lead (Entry-Point-
    // Matrix-Audit E1.1); gleiches ?promo=-Muster wie Mini-Wizard/Rueckruf.
    promo?: string
  }>
}) {
  const t = await getTranslations('werkstatt_finden')
  const sp = await searchParams

  // Karte auf URL-Param vorzentrieren — ?lat&lng direkt, sonst ?plz / ?stadt server-seitig
  // via Mapbox geocoden. Kein Param -> null -> Embed nutzt NRW-Default + Geolocation.
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
            name: 'Kfz-Werkstatt-Vermittlung über interaktive Karte',
            description:
              'Passende Kfz-Werkstatt in der Nähe finden: interaktive Karte mit geprüften Partner-Werkstätten, gerankt nach Marke, Schadensbild und Entfernung zum Fahrzeugstandort. Anfrage in wenigen Minuten — Karosserie, Lack, Smart Repair, Mechanik und Glas.',
            url: `${SITE_URL}/werkstatt-finden`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Werkstatt finden', url: '/werkstatt-finden' },
          ]),
        ])}
      />
      <h1 className="sr-only">{t('sr_h1')}</h1>

      {/* Vollbild-Finder (Karte + 4-Schritt-Wizard). initialCenter aus ?stadt/?plz/?lat&lng.
          Embed-only: bewusst KEIN Content darunter (sauberer Mobile-Scroll). */}
      <WerkstattFindenSection
        height="100dvh"
        initialCenter={initialCenter}
        clickIds={{ gclid: sp.gclid, gbraid: sp.gbraid, wbraid: sp.wbraid, gclsrc: sp.gclsrc }}
        promoCode={sp.promo?.trim() || undefined}
      />
    </>
  )
}
