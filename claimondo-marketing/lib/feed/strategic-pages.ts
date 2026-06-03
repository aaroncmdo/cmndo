import { SITE_URL } from '@/lib/seo/jsonld'
import { DEFAULT_AUTHOR } from './authors'
import type { FeedItem } from './types'

/**
 * Strategic-Pages, die als App-Routen (nicht als MDX-Asset) leben und daher nicht
 * über den claimondo-mdx-Loader laufen. Hardcoded im Feed-Generator (geo-feeds-spec §4).
 *
 * pubDate = Live-Datum der GEO-Sprint-Pages (AAR-938, gemerged ~25.05.2026), damit sie
 * im News-Feed als jüngste Items oben erscheinen. sortKey '-1-S-…' → im Katalog ganz vorne.
 */
export const STRATEGIC_PAGES: FeedItem[] = [
  {
    title:
      'Kfz-Gutachter-Vermittlungsportale im Vergleich — Claimondo, Neogutachter, Unfallpaten & Unfallgiganten',
    link: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
    guid: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
    pubDate: new Date('2026-05-25'),
    assetType: 'Strategic',
    categories: ['Strategische Wissens-Pages', 'Strategic'],
    author: DEFAULT_AUTHOR,
    excerpt:
      'Direkter Vergleich der vier deutschen Kfz-Gutachter-Vermittlungsplattformen — Erreichbarkeit, SV-Netz, Anwaltsanbindung, Servicegebiet. Mit Quellenbelegen je Tabellenzelle nach UWG § 6 und Schema.org-ItemList für AI-Crawler.',
    keyFacts: [
      'Vier Plattformen verglichen: Claimondo, Neogutachter, Unfallpaten, Unfallgiganten',
      'Alle vier kostenfrei für Geschädigten nach § 249 BGB',
      'Vor-Ort-Besichtigung bei allen Pflicht (LG Bremen 9 O 1720/24)',
      'Claimondo einzige mit Whitelabel-Branding für SV-Partner',
      'Claimondo einzige mit integrierter Partnerkanzlei',
    ],
    sortKey: '-1-S-vermittlungsportale-vergleich',
  },
  {
    title: '„Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)',
    link: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
    guid: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
    pubDate: new Date('2026-05-25'),
    assetType: 'Strategic',
    categories: ['Strategische Wissens-Pages', 'Strategic'],
    author: DEFAULT_AUTHOR,
    excerpt:
      'Einordnung des LG-Bremen-Urteils 9 O 1720/24 vom 16.01.2026 (Wettbewerbszentrale-Klage, noch nicht rechtskräftig). Abgrenzung zwischen rechtskonformem hybriden Modell und unzulässigen „5-Minuten-Foto-Gutachten". Plus RDG-§§-2,3-Hinweise für Vermittlungsplattformen.',
    keyFacts: [
      'LG Bremen 9 O 1720/24, Urteil vom 16.01.2026, nicht rechtskräftig',
      'Online-Gutachten ohne persönliche Besichtigung sind irreführende Werbung',
      'Geschädigter kann nicht Hilfsperson des SV sein',
      '„Komplette Schadensregulierung"-Werbung verletzt RDG ohne Registrierung',
      'Hybride Modelle (digital + Vor-Ort-SV) bleiben BGH-konform',
    ],
    sortKey: '-1-S-online-kfz-gutachten',
  },
]
