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

// Reihenfolge = Crawl-Prioritaet: die Kfz-naechsten Quellen zuerst, damit sie das
// begrenzte Crawl-Budget (CRAWL_CAP/PER_SOURCE_CAP) fuellen, bevor breitere Quellen
// (allg. Rechtsnews, Versicherungsmarkt) drankommen -> hoehere Relevanz-Trefferquote
// bei der Generierung (E2E-Smoke 02.07.: noisy-Feeds vorn -> 7/8 nicht_relevant).
export const B2B_CRAWL_SOURCES: CrawlSource[] = [
  // werkstatt — Kfz-Betrieb / Werkstatt-Fachpresse (Kfz-nah)
  {
    name: 'kfz-betrieb',
    category: 'werkstatt',
    kind: 'rss',
    url: 'https://www.kfz-betrieb.vogel.de/rss.xml',
  },

  // sv_verband — Prueforganisationen / Sachverstaendigen-Umfeld (Kfz-nah)
  {
    name: 'KÜS',
    category: 'sv_verband',
    kind: 'rss',
    url: 'https://www.kues.de/rss',
  },

  // recht — Rechtsprechung / Urteilsnachrichten (Verkehrs-/Schadenrecht; breiter, teils off-topic)
  {
    name: 'Rechtslupe',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.rechtslupe.de/feed',
  },

  // versicherung — Versicherungs- und Makler-Branchennews (breit; KI-Backstop filtert Nicht-Kfz)
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
]
