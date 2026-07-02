// Quell-Feeds fuer die B2B-Content-Pipeline. Alle URLs am 2026-07-02 live gegen
// den echten Feed verifiziert (HTTP 200 + parsebares RSS/Atom mit Items). Tote/teure
// Feeds werden zur Laufzeit uebersprungen (crawlSource -> []) — neue Quellen einfach
// hier ergaenzen. robots.txt/ToS beachten; RSS ist zur Syndication gedacht.

export type CrawlSource = {
  name: string
  category: 'recht' | 'versicherung' | 'sv_verband' | 'werkstatt'
  kind: 'rss'
  url: string
}

export const B2B_CRAWL_SOURCES: CrawlSource[] = [
  // recht — Rechtsprechung / Urteilsnachrichten (Verkehrs-/Schadenrecht)
  {
    name: 'Rechtslupe',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.rechtslupe.de/feed',
  },

  // versicherung — Versicherungs- und Makler-Branchennews
  {
    name: 'Versicherungsbote',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.versicherungsbote.de/feed/',
  },
  {
    name: 'AssCompact',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.asscompact.de/rss.xml',
  },
  {
    name: 'Pfefferminzia',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.pfefferminzia.de/feed/',
  },

  // sv_verband — Prueforganisationen / Sachverstaendigen-Umfeld
  {
    name: 'KÜS',
    category: 'sv_verband',
    kind: 'rss',
    url: 'https://www.kues.de/rss',
  },

  // werkstatt — Kfz-Betrieb / Werkstatt-Fachpresse
  {
    name: 'kfz-betrieb',
    category: 'werkstatt',
    kind: 'rss',
    url: 'https://www.kfz-betrieb.vogel.de/rss.xml',
  },
]
