import type { Stadt } from '@/lib/kfz-gutachter/staedte'
import { SITE_URL } from '@/lib/seo/jsonld'
import { DEFAULT_AUTHOR } from './authors'
import type { FeedItem } from './types'

/**
 * Stadt-Pages haben (noch) kein per-Stadt `lastUpdated` — das ist Freshness-Phase-1
 * (separater Branch). Bis dahin trägt der Katalog-Feed ein konstantes Stand-Datum.
 * Stadt-Items erscheinen NUR im Katalog-Feed (Inventar), nicht im News-Feed, weil
 * es ohne lastUpdated kein belastbares Freshness-Signal gibt.
 */
export const STADT_PAGES_LASTMOD = new Date('2026-05-24')

export function stadtToFeedItem(s: Stadt): FeedItem {
  const link = `${SITE_URL}/kfz-gutachter/${s.slug}`
  return {
    title: `Kfz-Gutachter ${s.name} — Sachverständige & Schadensregulierung`,
    link,
    guid: link,
    pubDate: STADT_PAGES_LASTMOD,
    assetType: 'Stadt',
    categories: ['Lokale Sachverständigen-Gebiete', 'Stadt'],
    author: DEFAULT_AUTHOR,
    excerpt: `Unabhängige Kfz-Gutachter in ${s.name} (${s.bundesland}). Sachverständiger mit Termin vor Ort, zuständiges ${s.lokal.landgericht}, BVSK-Honorarspanne ${s.bvskHonorarSpanne}. Schadensregulierung nach BGH-Linie inkl. Wertminderung, Mietwagen und Anwaltskosten — für unverschuldet Geschädigte kostenfrei nach § 249 BGB.`,
    keyFacts: [
      `Landgericht: ${s.lokal.landgericht}`,
      `BVSK-Honorarspanne: ${s.bvskHonorarSpanne}`,
      `PLZ-Bereich: ${s.plzPrefix}`,
      `Bundesland: ${s.bundesland}`,
    ],
    sortKey: `4-${s.name}`,
  }
}
