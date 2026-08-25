import {
  getCornerstones,
  getDecoder,
  getSachverstaendige,
  getVersicherer,
} from '@/lib/content/claimondo-mdx'
import { getPublishedArtikel, mapArtikelToFeedItem } from '@/lib/wissen/db-articles'
import { assetToFeedItem } from './asset-feed-item'
import type { FeedItem } from './types'

/** Eine Themen-Sektion der /wissen-Hub-Seite. `label`/`hint` sind nutzersichtbar. */
export interface WissenGroup {
  key: string
  label: string
  hint: string
  items: FeedItem[]
}

/** Verweis-Karte auf einen grossen Cluster-Hub (zu viele Items fuer eine Inline-Liste). */
export interface WissenHubLink {
  href: string
  label: string
  hint: string
}

export interface WissenData {
  gruppen: WissenGroup[]
  weiterstoebern: WissenHubLink[]
}

/**
 * Lesbare Aufbereitung der Feed-Inhalte fuer die /wissen-Hub-Seite — die
 * menschliche Zwillingsoberflaeche des Maschinen-Feeds (gleiche Quelle: die
 * Asset-Loader aus claimondo-mdx, via assetToFeedItem). Die 57 Haftpflicht-Spokes
 * und 87 Stadt-Seiten werden NICHT inline gelistet (zu viele) sondern als
 * Hub-Verweis ausgegeben — ihre eigenen Hubs (/haftpflicht, /kfz-gutachter)
 * existieren bereits.
 *
 * Zusaetzlich werden veroeffentlichte DB-Artikel (wissen_artikel) als eigene
 * Gruppe vorangestellt, damit Besucher neue Redaktions-Artikel browsen koennen.
 */
export async function getWissenData(): Promise<WissenData> {
  const mdxGruppen: WissenGroup[] = [
    {
      key: 'cornerstone',
      label: 'Ratgeber & Grundlagen',
      hint: 'Die großen Leitfäden zur Schadenregulierung nach unverschuldetem Unfall.',
      items: getCornerstones().map(assetToFeedItem),
    },
    {
      key: 'decoder',
      label: 'Versicherer-Brief-Decoder',
      hint: 'Was die Schreiben der gegnerischen Versicherung wirklich bedeuten – und wie Sie reagieren.',
      items: getDecoder().map(assetToFeedItem),
    },
    {
      key: 'versicherer',
      label: 'Versicherer-Profile',
      hint: 'Regulierungs- und Kürzungspraxis der großen Kfz-Haftpflichtversicherer im Detail.',
      items: getVersicherer().map(assetToFeedItem),
    },
    {
      key: 'sachverstaendige',
      label: 'Sachverständige & Verbände',
      hint: 'BVSK, DEKRA, GTÜ und Co. – wer wofür steht und worauf es bei der Wahl ankommt.',
      items: getSachverstaendige().map(assetToFeedItem),
    },
  ].filter((g) => g.items.length > 0)

  // getPublishedArtikel braucht einen Next.js-Request-Scope (cookies()).
  // Im Vitest-Kontext (kein Request-Scope) faellt es auf [] zurueck statt zu werfen.
  const dbArtikel = await getPublishedArtikel().catch(() => [])
  const redaktionItems = dbArtikel.map(mapArtikelToFeedItem)

  const gruppen: WissenGroup[] = [
    ...(redaktionItems.length > 0
      ? [
          {
            key: 'redaktion',
            label: 'Neu aus der Redaktion',
            hint: 'Aktuell veröffentlichte Beiträge aus unserer Redaktion – praxisnahe Analysen und Tipps rund um den Kfz-Schaden.',
            items: redaktionItems,
          },
        ]
      : []),
    ...mdxGruppen,
  ]

  const weiterstoebern: WissenHubLink[] = [
    {
      href: '/haftpflicht',
      label: 'Kfz-Haftpflichtschaden-Glossar',
      hint: 'Alle Begriffe rund um Haftung, Schadenspositionen, Fristen und typische Unfall-Szenarien.',
    },
    {
      href: '/kfz-gutachter',
      label: 'Kfz-Gutachter in Ihrer Stadt',
      hint: 'Lokale Sachverständige und Schadenregulierung – bundesweit nach Stadt.',
    },
  ]

  return { gruppen, weiterstoebern }
}
