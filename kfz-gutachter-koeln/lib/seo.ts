import type { Metadata } from 'next'
import { SITE } from './site'
import { CLUSTER, type City } from './cluster'

// Per-Stadt-Metadata: unique Title + Description + Canonical + OG.
// Hub (Hauptstadt) canonical = "/"; Spokes = "/lp/{slug}/". Die Spoke-Page der
// Hauptstadt (/lp/wuppertal/) zeigt canonical auf "/" (Dedup gegen den Hub).

/** Canonical-Pfad fuer eine Stadt im gegebenen Routing-Kontext. */
export function canonicalPath(city: City, route: 'hub' | 'spoke'): string {
  if (route === 'hub') return '/'
  return city.main ? '/' : `/lp/${city.slug}`
}

export function metadataForCity(city: City, route: 'hub' | 'spoke'): Metadata {
  const title = `Kfz-Gutachter ${city.name} · bei Unschuld 0 € · DAT`
  const description = `Kfz-Gutachter ${city.name}: ${city.h1Sub}. Gerichtsfestes DAT-Gutachten, bei Unschuld 0 €. Anwalt & Mietwagen inklusive — Soforthilfe rund um ${city.name}.`
  const canonical = canonicalPath(city, route)
  const ogImage = `${CLUSTER.imgPath}og-${CLUSTER.key}.png`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: SITE.locale,
      url: `${SITE.url}${canonical}`,
      siteName: SITE.name,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  }
}
