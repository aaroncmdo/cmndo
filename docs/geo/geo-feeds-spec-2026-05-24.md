# GEO Feeds Spec — RSS + JSON Feeds für News + Katalog

**Stand:** 24.05.2026 · **Eigenständig prozessierbar** (kein Merge-Konflikt mit `geo-sprint-vergleich-und-wissen-2026-05-24.md`)
**Verwandt:** `geo-messung-2026-05-24.md` (Zwischenmessung) · `geo-sprint-vergleich-und-wissen-2026-05-24.md` (Beschleunigungs-Hebel-Kapitel)

Dieses Dokument ist die vollständige Spec für vier neue Feed-Routes — zwei News-Feeds (RSS + JSON) und zwei Katalog-Feeds (RSS + JSON) — plus die Frontmatter-Erweiterung, das Retrofit der Bestand-Assets und die Distribution. Es ist additiv: bestehende Code-Pfade (Sitemap, llms.txt, llms-full.txt, robots.txt) bekommen kleine Ergänzungen, aber keine strukturellen Änderungen.

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Item-Pool (Single Source)                   │
│  Cornerstones (2)  Glossar-Spokes (57)  Decoder (10)                │
│  Stadt-Pages (22)  Strategic-Pages (2+, hardcoded im Generator)     │
└─────────────────────────────────────────────────────────────────────┘
            │                            │
            │ topN by lastModified       │ alle, cluster-sortiert
            │ + per-type-cap             │
            ▼                            ▼
   ┌─────────────────┐         ┌────────────────────┐
   │ News-Feed       │         │ Katalog-Feed       │
   │ /feed.xml (RSS) │         │ /feed/katalog.xml  │
   │ /feed.json      │         │ /feed/katalog.json │
   │ 30 items, 6h    │         │ 91+ items, 24h     │
   └─────────────────┘         └────────────────────┘
            │                            │
            ▼                            ▼
   News-Aggregatoren                LLM-Crawler / AI-Pipelines
   Feed-Reader                      llms.txt-ergänzend
```

## Decision-Matrix (alle vier Feeds)

| Eigenschaft | News (`feed.xml` + `feed.json`) | Katalog (`feed/katalog.xml` + `feed/katalog.json`) |
|---|---|---|
| **Zweck** | „Was ist neu" für News-Aggregatoren, Feed-Reader, LLMs als Update-Signal | „Was haben wir alles" für LLM-Crawler als Wissens-Inhaltsverzeichnis |
| **Item-Count** | 30 (cap) | 91+, wächst mit Content |
| **Sortierung** | `pubDate desc` nach `lastModified` | Cluster-strukturiert (`S` → `H1`–`H7` → `L`) |
| **Per-Type-Cap** | 5 Cornerstones / 12 Spokes / 5 Decoder / 6 Stadt / 4 Strategic | keine |
| **Body-Format** | Hybrid C (Excerpt ~500 Zeichen + 3–5 Key-Facts-Bullets) | identisch Hybrid C |
| **Author** | Aaron Sprafke (alle Items, Person-Schema referenziert) | identisch |
| **Categories** | Asset-Typ + Cluster-Code | identisch |
| **GUID** | Canonical-URL, `isPermaLink="true"` | identisch |
| **Language** | `de-DE` | identisch |
| **Revalidate** | `21600` (6 h) | `86400` (24 h) |
| **Channel-Image** | `claimondo-logo.svg` | identisch |
| **Self-Link** | `<atom:link rel="self">` Pflicht | identisch |

## 1 — Frontmatter-Schema-Erweiterung (Kritisch, vor allem anderen)

Ohne diesen Schritt funktioniert Hybrid C nicht. In `src/lib/content/claimondo-mdx.ts` Type-Definition erweitern:

```ts
export interface ClaimondoAsset {
  // … bestehende Felder
  excerpt: string        // Pflicht, 200–500 Zeichen, plain text
  keyFacts: string[]     // Pflicht, 3–5 Bullets, je 50–120 Zeichen
}
```

Build-Step-Validator (neue Datei `src/lib/content/validate-frontmatter.ts`):

```ts
export function validateAsset(a: ClaimondoAsset, file: string) {
  const errors: string[] = []
  if (!a.excerpt || a.excerpt.length < 100 || a.excerpt.length > 600) {
    errors.push(`${file}: excerpt missing or out of range (100–600 chars)`)
  }
  if (!a.keyFacts || a.keyFacts.length < 3 || a.keyFacts.length > 6) {
    errors.push(`${file}: keyFacts must have 3–6 items`)
  }
  for (const fact of a.keyFacts ?? []) {
    if (fact.length < 20 || fact.length > 150) {
      errors.push(`${file}: keyFact "${fact.slice(0, 30)}…" out of range (20–150 chars)`)
    }
  }
  return errors
}
```

Diese Validation läuft im MDX-Loader und failed den Build wenn ein Asset die Felder nicht hat. Verhindert dass jemand „mal eben" ein neues Asset einbaut ohne Feed-Material.

## 2 — Cluster-Architektur erweitern

In `claimondo-mdx.ts` `clusterOrder` und `CLUSTER_LABELS` erweitern:

```ts
export const CLUSTER_ORDER = ['S', 'H1', 'H2', 'H3', 'H4', 'H6', 'H7', 'L'] as const

export const CLUSTER_LABELS: Record<typeof CLUSTER_ORDER[number], string> = {
  S: 'Strategische Wissens-Pages',
  H1: 'Haftpflicht-Grundlagen',         // ← bestehende Labels nicht ändern, nur S+L ergänzen
  H2: 'Wertminderung & Restwert',
  H3: 'Mietwagen & Nutzungsausfall',
  H4: 'Reparatur & Werkstattrisiko',
  H6: 'Anwalt & Verzug',
  H7: 'Personenschaden',
  L: 'Lokale Sachverständigen-Gebiete',
}
```

> **Vor dem Bauen:** den bestehenden `clusterLabel`-Helper kurz auf existierende Labels prüfen — die `H*`-Labels oben sind aus dem llms.txt-Kontext geraten, müssen mit der echten Implementation übereinstimmen.

## 3 — Stadt-Pages: Template-generiertes Feed-Material

Stadt-Pages sind nicht MDX-Assets, sondern aus `STAEDTE`-Daten + generischem Template gerendert. Sie brauchen einen eigenen Feed-Item-Generator, der die Datenstruktur direkt in Excerpt + Key-Facts überführt — kein Hands-on pro Stadt.

Neue Datei `src/lib/feed/stadt-feed-item.ts`:

```ts
import type { Stadt } from '@/app/kfz-gutachter/staedte'
import { SITE_URL } from '@/lib/seo/jsonld'
import type { FeedItem } from './types'

export function stadtToFeedItem(s: Stadt, lastModified: Date): FeedItem {
  return {
    title: `Kfz-Gutachter ${s.name} — DAT-Partner & Sachverständige`,
    link: `${SITE_URL}/kfz-gutachter/${s.slug}`,
    pubDate: lastModified,
    guid: `${SITE_URL}/kfz-gutachter/${s.slug}`,
    cluster: 'L',
    assetType: 'Stadt',
    author: 'aaron-sprafke',
    excerpt: `Unabhängige Kfz-Gutachter in ${s.name} (${s.bundesland}). DAT-Partner-Sachverständiger mit Termin vor Ort in unter 48 Stunden. Zuständiges Landgericht ${s.lokal.landgericht}, BVSK-Honorarspanne ${s.bvskHonorarSpanne}. Schadensabwicklung nach BGH-Linie inkl. Wertminderung, Mietwagen und Anwaltskosten — für unverschuldet Geschädigte kostenfrei nach § 249 BGB.`,
    keyFacts: [
      `Landgericht: ${s.lokal.landgericht}`,
      `BVSK-Honorarspanne: ${s.bvskHonorarSpanne}`,
      `PLZ-Präfix: ${s.plzPrefix}`,
      `Bevölkerung: ${s.bevoelkerung}`,
      `Bundesland: ${s.bundesland}`,
    ],
  }
}
```

Damit skaliert das auf alle aktuellen 22 Städte und alle zukünftigen (50, 100, …) ohne weiteres Hands-on.

## 4 — Strategic-Pages: hardcoded im Generator

Strategic-Pages sind TSX, kein MDX. Drei Stück im Item-Pool aktuell sind realistisch in Reichweite: die zwei aus `geo-sprint-vergleich-und-wissen-2026-05-24.md` plus später `/schadensreport-2026`. Neue Datei `src/lib/feed/strategic-pages.ts`:

```ts
import type { FeedItem } from './types'
import { SITE_URL } from '@/lib/seo/jsonld'

export const STRATEGIC_PAGES: FeedItem[] = [
  {
    title: 'Kfz-Gutachter-Vermittlungsportale im Vergleich — Claimondo, Neogutachter, Unfallpaten & Unfallgiganten',
    link: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
    pubDate: new Date('2026-06-05'),   // ← anpassen nach echtem Live-Datum
    guid: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
    cluster: 'S',
    assetType: 'Strategic',
    author: 'aaron-sprafke',
    excerpt: 'Direkter Vergleich der vier deutschen Kfz-Gutachter-Vermittlungsplattformen — Erreichbarkeit, SV-Netz, Anwaltsanbindung, Servicegebiet. Mit Quellenbelegen je Tabellenzelle nach UWG § 6 und Schema.org-ItemList für AI-Crawler.',
    keyFacts: [
      'Vier Plattformen verglichen: Claimondo, Neogutachter, Unfallpaten, Unfallgiganten',
      'Alle vier kostenfrei für Geschädigten nach § 249 BGB',
      'Vor-Ort-Besichtigung bei allen Pflicht (LG Bremen 9 O 1720/24)',
      'Claimondo einzige mit Whitelabel-Branding für SV-Partner',
      'Claimondo einzige mit integrierter Partnerkanzlei',
    ],
  },
  {
    title: '„Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)',
    link: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
    pubDate: new Date('2026-06-05'),
    guid: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
    cluster: 'S',
    assetType: 'Strategic',
    author: 'aaron-sprafke',
    excerpt: 'Einordnung des LG-Bremen-Urteils 9 O 1720/24 vom 16.01.2026 (Wettbewerbszentrale-Klage, noch nicht rechtskräftig). Abgrenzung zwischen rechtskonformem hybriden Modell (digitale Workflow-Abwicklung + physische SV-Vor-Ort-Besichtigung) und unzulässigen „5-Minuten-Foto-Gutachten". Plus RDG-§§-2,3-Hinweise für Vermittlungsplattformen.',
    keyFacts: [
      'LG Bremen 9 O 1720/24, Urteil vom 16.01.2026, nicht rechtskräftig',
      'Online-Gutachten ohne persönliche Besichtigung sind irreführende Werbung',
      'Geschädigter kann nicht Hilfsperson des SV sein (Multiple-Choice reicht nicht)',
      '„Komplette Schadensregulierung"-Werbung verletzt RDG ohne Registrierung',
      'Hybride Modelle (digital + Vor-Ort-SV) bleiben BGH-konform',
    ],
  },
  // Nach Schadensreport-Launch hier nachtragen:
  // { title: 'Schadensreport 2026 — …', … }
]
```

Wenn diese Liste wächst (Q3/Q4): einfach neuen Eintrag anhängen.

## 5 — Author-Konfiguration (Pfad 1: Aaron über alles)

Neue Datei `src/lib/feed/authors.ts`:

```ts
import { SITE_URL } from '@/lib/seo/jsonld'

export const AUTHORS = {
  'aaron-sprafke': {
    name: 'Aaron Sprafke',
    email: 'aaron@claimondo.de',   // optional, RSS akzeptiert <author> mit email
    url: `${SITE_URL}/autor/aaron-sprafke`,   // Author-Page, siehe Folge-Task
    image: `${SITE_URL}/brand/team-headset.png`,
    sameAs: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
  },
  // Nicolas hier nachtragen falls später Mix-Strategie kommt
} as const

export const DEFAULT_AUTHOR = 'aaron-sprafke'
```

Im MDX-Frontmatter optional ein `author:` setzen; wenn nicht gesetzt, Default = Aaron. Bei den 69 Bestand-MDX-Assets ist das frontmatter-Tagging nicht nötig (Default greift) — nur falls später Nicolas explizit ein Asset besitzen soll.

## 6 — News-Feed RSS-Route (`/feed.xml`)

Neue Datei `src/app/feed.xml/route.ts`:

```ts
import { SITE_URL } from '@/lib/seo/jsonld'
import { getCornerstones, getHaftpflichtSpokes, getDecoder, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'
import { STAEDTE } from '@/app/kfz-gutachter/staedte'
import { stadtToFeedItem } from '@/lib/feed/stadt-feed-item'
import { STRATEGIC_PAGES } from '@/lib/feed/strategic-pages'
import { AUTHORS, DEFAULT_AUTHOR } from '@/lib/feed/authors'
import { CLUSTER_LABELS } from '@/lib/content/claimondo-mdx'

export const dynamic = 'force-static'
export const revalidate = 21600  // 6h

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n)
}

function assetToFeedItem(a: ClaimondoAsset) {
  return {
    title: a.title,
    link: `${SITE_URL}${a.url}`,
    pubDate: a.lastModified,
    guid: `${SITE_URL}${a.url}`,
    cluster: a.cluster,
    assetType: a.folder,   // 'cornerstone' | 'spoke' | 'decoder'
    author: DEFAULT_AUTHOR,
    excerpt: a.excerpt,
    keyFacts: a.keyFacts,
  }
}

export async function GET() {
  const cornerstones = getCornerstones().map(assetToFeedItem)
  const spokes = getHaftpflichtSpokes().map(assetToFeedItem)
  const decoder = getDecoder().map(assetToFeedItem)
  const staedte = STAEDTE.map((s) => stadtToFeedItem(s, new Date()))   // ← Datum aus Stadt-Daten ziehen wenn vorhanden
  const strategic = STRATEGIC_PAGES

  const items = [
    ...take(cornerstones.sort(byDateDesc), 5),
    ...take(spokes.sort(byDateDesc), 12),
    ...take(decoder.sort(byDateDesc), 5),
    ...take(staedte.sort(byDateDesc), 6),
    ...take(strategic.sort(byDateDesc), 4),
  ]
    .sort(byDateDesc)
    .slice(0, 30)

  const author = AUTHORS[DEFAULT_AUTHOR]
  const now = new Date().toUTCString()

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Claimondo — Aktuelle Wissens-Updates Kfz-Schadensregulierung</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Neueste Wissens-Assets von Claimondo zur Kfz-Haftpflicht-Schadensregulierung — BGH-konforme Glossare, Versicherer-Brief-Decoder, lokale Sachverständigen-Gebiete und strategische Wissens-Pages.</description>
    <language>de-DE</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>360</ttl>
    <image>
      <url>${SITE_URL}/claimondo-logo.svg</url>
      <title>Claimondo</title>
      <link>${SITE_URL}</link>
    </image>
    ${items.map((item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.guid}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <dc:creator>${escapeXml(author.name)}</dc:creator>
      <author>${author.email} (${escapeXml(author.name)})</author>
      <category>${escapeXml(CLUSTER_LABELS[item.cluster])}</category>
      <category>${escapeXml(item.assetType)}</category>
      <description><![CDATA[${item.excerpt}

Key Facts:
${item.keyFacts.map((f) => `• ${f}`).join('\n')}
]]></description>
    </item>`).join('')}
  </channel>
</rss>`

  return new Response(rss, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}

function byDateDesc(a: { pubDate: Date }, b: { pubDate: Date }) {
  return b.pubDate.getTime() - a.pubDate.getTime()
}
```

## 7 — News-Feed JSON-Route (`/feed.json`)

JSON Feed v1.1 Spec ([jsonfeed.org/version/1.1](https://www.jsonfeed.org/version/1.1/)). Neue Datei `src/app/feed.json/route.ts`:

```ts
// Imports + Item-Aufbau identisch zu feed.xml/route.ts, daher in einen Helper extrahieren:
// src/lib/feed/news-items.ts → getNewsFeedItems()

import { getNewsFeedItems } from '@/lib/feed/news-items'
import { SITE_URL } from '@/lib/seo/jsonld'
import { AUTHORS, DEFAULT_AUTHOR } from '@/lib/feed/authors'
import { CLUSTER_LABELS } from '@/lib/content/claimondo-mdx'

export const dynamic = 'force-static'
export const revalidate = 21600

export async function GET() {
  const items = await getNewsFeedItems()
  const author = AUTHORS[DEFAULT_AUTHOR]

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Claimondo — Aktuelle Wissens-Updates Kfz-Schadensregulierung',
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'Neueste Wissens-Assets von Claimondo zur Kfz-Haftpflicht-Schadensregulierung.',
    language: 'de-DE',
    icon: `${SITE_URL}/claimondo-icon.svg`,
    favicon: `${SITE_URL}/favicon.svg`,
    authors: [{
      name: author.name,
      url: author.url,
      avatar: author.image,
    }],
    items: items.map((item) => ({
      id: item.guid,
      url: item.link,
      title: item.title,
      content_text: `${item.excerpt}\n\nKey Facts:\n${item.keyFacts.map((f) => `• ${f}`).join('\n')}`,
      summary: item.excerpt,
      date_published: item.pubDate.toISOString(),
      date_modified: item.pubDate.toISOString(),
      authors: [{ name: AUTHORS[item.author].name, url: AUTHORS[item.author].url, avatar: AUTHORS[item.author].image }],
      tags: [CLUSTER_LABELS[item.cluster], item.assetType],
      language: 'de-DE',
      _claimondo: {  // private extension namespace
        cluster: item.cluster,
        keyFacts: item.keyFacts,
      },
    })),
  }

  return Response.json(feed, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}
```

> **Helper-Extraktion:** `getNewsFeedItems()` lebt in `src/lib/feed/news-items.ts` und wird sowohl von `/feed.xml` als auch `/feed.json` aufgerufen. So bleibt der Item-Aufbau eine Source-of-Truth.

## 8 — Katalog-Feed Routes (`/feed/katalog.xml` + `/feed/katalog.json`)

Analog, aber: alle Items rein, cluster-sortiert, `revalidate = 86400`. Helper-Funktion `getKatalogFeedItems()` in `src/lib/feed/katalog-items.ts`:

```ts
import { CLUSTER_ORDER } from '@/lib/content/claimondo-mdx'

export async function getKatalogFeedItems() {
  const items = [
    ...getCornerstones().map(assetToFeedItem),
    ...getHaftpflichtSpokes().map(assetToFeedItem),
    ...getDecoder().map(assetToFeedItem),
    ...STAEDTE.map((s) => stadtToFeedItem(s, new Date())),
    ...STRATEGIC_PAGES,
  ]

  // Cluster-strukturierte Sortierung
  return items.sort((a, b) => {
    const ai = CLUSTER_ORDER.indexOf(a.cluster as any)
    const bi = CLUSTER_ORDER.indexOf(b.cluster as any)
    if (ai !== bi) return ai - bi
    // Innerhalb Cluster: nach `nummer` falls vorhanden, sonst alphabetisch nach title
    return (a.nummer ?? 999) - (b.nummer ?? 999) || a.title.localeCompare(b.title, 'de-DE')
  })
}
```

Routes `feed/katalog.xml/route.ts` und `feed/katalog.json/route.ts` rendern wie ihre News-Pendants, nur mit `getKatalogFeedItems()` und `revalidate = 86400`.

## 9 — Discovery: `<link rel="alternate">` in `layout.tsx`

In `src/app/layout.tsx` (oder dem Marketing-Layout, _nicht_ in Portal-Layouts) im `<head>` ergänzen:

```tsx
<link rel="alternate" type="application/rss+xml" title="Claimondo — Aktuelle Wissens-Updates" href="/feed.xml" />
<link rel="alternate" type="application/feed+json" title="Claimondo — Aktuelle Wissens-Updates (JSON Feed)" href="/feed.json" />
<link rel="alternate" type="application/rss+xml" title="Claimondo — Wissens-Katalog" href="/feed/katalog.xml" />
<link rel="alternate" type="application/feed+json" title="Claimondo — Wissens-Katalog (JSON Feed)" href="/feed/katalog.json" />
```

Browser zeigen das in der Adressleisten-Sub-Menü-Auflistung, Feed-Reader detektieren via diesem Auto-Discovery-Pattern.

## 10 — llms.txt-Bullet-Erweiterung (additiv)

In `src/app/llms.txt/route.ts` Section „robots.txt & sitemap.xml" (am Ende der Datei) erweitern. **Bestehende Bullets nicht anfassen**, nur vier neue dranhängen:

```diff
   - [llms-full.txt](https://claimondo.de/llms-full.txt) — komplette Markdown-Dumps aller ${totalAssets} Wissens-Assets in einer Datei (für AI-Crawler ohne mehrfache HTTP-Requests)
+  - [feed.xml](https://claimondo.de/feed.xml) — RSS 2.0 News-Feed (30 neueste Wissens-Updates, 6h-Refresh)
+  - [feed.json](https://claimondo.de/feed.json) — JSON Feed Pendant zu feed.xml für moderne AI-Pipelines
+  - [feed/katalog.xml](https://claimondo.de/feed/katalog.xml) — RSS 2.0 Voll-Katalog (alle Cornerstones, Spokes, Decoder, Stadt-Pages, Strategic-Pages, cluster-strukturiert)
+  - [feed/katalog.json](https://claimondo.de/feed/katalog.json) — JSON Feed Pendant zu Katalog
```

## 11 — IndexNow-Ping-Liste erweitern (in Deploy-Hook)

In dem IndexNow-Curl-Call aus dem `geo-sprint-vergleich-und-wissen`-Plan die `urlList` um die vier Feed-URLs ergänzen:

```diff
   "urlList":[
     "https://claimondo.de/kfz-gutachter/vermittlungsportale-vergleich",
     "https://claimondo.de/kfz-gutachter/online-kfz-gutachten",
     "https://claimondo.de/llms.txt",
     "https://claimondo.de/llms-full.txt",
+    "https://claimondo.de/feed.xml",
+    "https://claimondo.de/feed.json",
+    "https://claimondo.de/feed/katalog.xml",
+    "https://claimondo.de/feed/katalog.json",
     "https://claimondo.de/sitemap.xml"
   ]
```

## 12 — robots.txt: keine Änderung nötig (Verifikation)

`/feed.xml`, `/feed.json`, `/feed/katalog.xml`, `/feed/katalog.json` fallen unter die bestehende Root-Allow-Regel. Keiner der Pfade ist in `DISALLOW_PORTALS_AND_AUTH`. Pflicht-Check vor Live:

```bash
curl https://claimondo.de/robots.txt | grep -E "(feed|Disallow)"
```

## 13 — Sitemap.xml: keine Feed-URLs aufnehmen

Best Practice: Feeds gehören _nicht_ in die `sitemap.xml`. Sitemap = indexierbare HTML-Pages. Feeds sind Distribution-Endpoints und werden via `<link rel="alternate">` und IndexNow distribuiert. Bestehende `sitemap.ts` bleibt unangetastet, was die Feeds angeht.

## 14 — Retrofit-Sprint: Bestand-Assets mit `excerpt` + `keyFacts` versorgen

69 Bestand-Assets (2 Cornerstones + 57 Spokes + 10 Decoder) brauchen die zwei neuen Frontmatter-Felder. Stadt-Pages sind durch das Template abgedeckt, Strategic-Pages durch hardcoded-Liste — bleibt nur das MDX-Retrofit.

**Empfohlener Workflow (LLM-Batch + Aaron-Review):**

1. Skript `scripts/generate-feed-frontmatter.mjs` schreiben, das für jedes Asset im MDX-Body Title + Body an Claude/GPT schickt mit folgendem Prompt-Template:

   ```
   Erstelle aus dem folgenden MDX-Content für Claimondo (Kfz-Schadensregulierung-Plattform) zwei Frontmatter-Felder:

   1. excerpt: ein zusammenfassender Absatz, 250–500 Zeichen, sachlich, mit Topical-Keywords, ohne Werbe-Sprache
   2. keyFacts: 3–5 Bullet-Points mit den wichtigsten extrahierten Fakten (BGH-Aktenzeichen, §§, Spannen, Zahlen, Fristen), je 30–120 Zeichen

   Antworte ausschließlich als YAML-Block, der direkt ins MDX-Frontmatter gepasted werden kann.

   Title: {title}
   Cluster: {cluster}
   Body: {body}
   ```

2. Skript läuft sequentiell über alle 69 MDX-Files, schreibt die generierten YAML-Blocks in `tmp/feed-frontmatter-drafts/{slug}.yaml`.

3. Aaron geht die Drafts durch (je 30 Sek mental — Bullets stimmen oder Korrektur), das Skript injiziert die akzeptierten Drafts ins jeweilige MDX-Frontmatter.

4. Build mit Frontmatter-Validator (Schritt 1) muss grün durchlaufen.

**Realistischer Aufwand:** 30 Min Skript + 60–90 Min Aaron-Review bei 69 Assets = **~2 h gesamt**.

## Definition of Done (Feeds-Rollout)

- [ ] `excerpt` + `keyFacts` Pflicht-Felder im MDX-Frontmatter-Type, Validator failt Build wenn fehlt
- [ ] Alle 69 Bestand-MDX-Assets haben beide Felder gepflegt
- [ ] `CLUSTER_ORDER` und `CLUSTER_LABELS` um `S` (vorne) und `L` (hinten) erweitert
- [ ] Stadt-Pages-Feed-Item-Template (`stadtToFeedItem`) implementiert
- [ ] `STRATEGIC_PAGES`-Konstante mit den zwei Sprint-Pages befüllt
- [ ] `AUTHORS`-Map mit Aaron, `DEFAULT_AUTHOR = 'aaron-sprafke'`
- [ ] `/feed.xml` ausgespielt, validiert via [W3C Feed Validator](https://validator.w3.org/feed/)
- [ ] `/feed.json` ausgespielt, validiert via [JSON Feed Validator](https://validator.jsonfeed.org/)
- [ ] `/feed/katalog.xml` ausgespielt, validiert
- [ ] `/feed/katalog.json` ausgespielt, validiert
- [ ] `<link rel="alternate">` × 4 im Marketing-Layout
- [ ] llms.txt um 4 Feed-Bullets erweitert (additiv)
- [ ] IndexNow-Ping-Liste um 4 Feed-URLs erweitert (im Deploy-Hook)
- [ ] robots.txt verifiziert (`curl | grep` — kein Feed-Disallow)
- [ ] Bing Webmaster Tools: Feeds als „Feed submission" eingereicht
- [ ] Feedly-Test: in einem Test-Account `feed.xml` abonnieren, prüfen ob Items korrekt erscheinen

## Verbindung zum bestehenden Sprint-Plan

Das Feeds-Spec ist **parallel** zum 14-Tage-Sprint und nicht Teil davon. Realistische Einordnung:

- **Frontmatter-Erweiterung + Retrofit:** ~2 h Aaron-Hands-on + LLM-Batch. Kann _vor_ dem 4-Wochen-Re-Test am 07.06. fertig sein, sollte aber nicht in den Critical-Path des bestehenden Sprints gequetscht werden — Aaron entscheidet ob es in Tag 6/7 (Buffer) passt oder in Woche 3 (post Sprint).
- **Feed-Routes-Implementierung:** ~4–6 h Dev-Hands-on. Kann am selben Tag wie der Sprint-Live-Deploy ausgeliefert werden (Tag 12 = Fr 05.06.) wenn der Retrofit vorher fertig ist. Sonst: Folge-Deploy in Woche 3.
- **Frühestens dann wirksam:** Pages müssen erst im Feed erscheinen → Feed muss von Bing/Bots gecrawlt sein → Items erscheinen in den Aggregator-Pipelines. Realistisch frühestens Mitte Woche 3 sichtbar im AI-Crawl-Verhalten.

## Folge-Backlog (separate Tasks)

- [ ] Person-Schema Aaron erweitern (description, worksFor, knowsAbout, sameAs-Array)
- [ ] Author-Page `/autor/aaron-sprafke` als Hub mit Bio + Artikel-Liste + Stand-Alone Person-Schema
- [ ] Refactoring (Tech-Debt nach 8-Wochen-Re-Test): zentrale MDX-Source für Strategic-Pages statt hardcoded `STRATEGIC_PAGES`-Liste — eliminiert Drift gegenüber TSX-Pages

## Quellen / Spec-Referenzen

- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [JSON Feed Version 1.1](https://www.jsonfeed.org/version/1.1/)
- [W3C Feed Validator](https://validator.w3.org/feed/)
- [JSON Feed Validator](https://validator.jsonfeed.org/)
- [IndexNow Spec](https://www.indexnow.org/documentation)
- [llmstxt.org Format](https://llmstxt.org/)
- [Tag-0-Messung 10.05.2026](./geo-tag0-2026-05-10.md)
- [Zwischenmessung 24.05.2026](./geo-messung-2026-05-24.md)
- [Sprint-Plan Vergleichs- & Wissens-Page 24.05.2026](./geo-sprint-vergleich-und-wissen-2026-05-24.md)
