import type { MetadataRoute } from 'next'

/**
 * ⚠ Der wichtigste Teil ist nicht, was erlaubt wird, sondern was NICHT.
 *
 * `/check/[token]` traegt den Befund eines namentlich genannten Betriebs,
 * `/plan/[token]` seinen Massnahmenplan, `/auswertung/[token]` zusaetzlich den
 * Gespraechsleitfaden samt Einwandbehandlung. Alle drei sind nur durch einen
 * Token geschuetzt und waren bis zum 20.08.2026 ohne jede Sperre indexierbar.
 * Ein einziger geteilter Link haette gereicht, damit ein fremder Befund in der
 * Suche auftaucht.
 *
 * robots.txt allein genuegt nicht — sie ist eine Bitte, kein Riegel. Deshalb
 * tragen dieselben Seiten zusaetzlich `robots: { index: false }` in ihren
 * Metadaten (zwei Ebenen, weil die eine ausfallen kann).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/check/', '/plan/', '/auswertung', '/anmelden'],
    },
    sitemap: 'https://sv-levelup.claimondo.de/sitemap.xml',
  }
}
