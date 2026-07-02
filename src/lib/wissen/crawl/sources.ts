// Live-URLs werden im Prod-Smoke verifiziert; tote/teure Feeds werden zur Laufzeit
// uebersprungen (crawlSource -> []).

export type CrawlSource = {
  name: string
  category: 'recht' | 'versicherung' | 'sv_verband' | 'werkstatt'
  kind: 'rss'
  url: string
}

export const B2B_CRAWL_SOURCES: CrawlSource[] = [
  // recht — Rechts- und Urteilsnachrichten
  {
    name: 'LTO Recht',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.lto.de/rss/nachrichten/',
  },
  {
    name: 'Bundesgerichtshof Pressemitteilungen',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.bundesgerichtshof.de/SiteGlobals/Functions/RSSFeed/ZP_RSSNewsfeed/ZP_RSSNewsfeed.xml',
  },

  // versicherung — Branchen- und Marktthemen
  {
    name: 'Versicherungsbote',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.versicherungsbote.de/feed/',
  },
  {
    name: 'KFZ-Betrieb Versicherung',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.kfz-betrieb.vogel.de/rss/themen/versicherungen/',
  },

  // sv_verband — Sachverstaendigen-Verbaende und Prueforganisationen
  {
    name: 'DEKRA Presse',
    category: 'sv_verband',
    kind: 'rss',
    url: 'https://www.dekra.de/de/presse/pressemitteilungen/rss/',
  },
  {
    name: 'GTU Presse',
    category: 'sv_verband',
    kind: 'rss',
    url: 'https://www.gtue.de/rss.xml',
  },

  // werkstatt — Kfz-Werkstatt-Fachpresse
  {
    name: 'KFZ-Betrieb Werkstatt',
    category: 'werkstatt',
    kind: 'rss',
    url: 'https://www.kfz-betrieb.vogel.de/rss/themen/werkstatt/',
  },
  {
    name: 'Autohaus Online',
    category: 'werkstatt',
    kind: 'rss',
    url: 'https://www.autohaus.de/rss',
  },
]
