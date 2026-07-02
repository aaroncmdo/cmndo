// RSS/Atom-Parser — keine externen Abhaengigkeiten, tolerante Regex-Extraktion.
// Verarbeitet sowohl RSS 2.0 (<item>) als auch Atom (<entry>).

export type CrawlItem = {
  title: string
  summary: string
  link: string
  sourceName: string
}

// ---------------------------------------------------------------------------
// HTML-Entity-Decoder + CDATA-Stripper + HTML-Tag-Entferner
// ---------------------------------------------------------------------------

function decodeCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, (_, inner: string) => inner)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)))
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ')
}

function cleanText(s: string): string {
  // Order: CDATA first, then strip literal tags, then decode entities (which may
  // reveal further pseudo-tags like &lt;b&gt; -> <b>), then strip those too.
  const afterCdata = decodeCdata(s)
  const afterFirstTagStrip = stripHtmlTags(afterCdata)
  const afterEntities = decodeEntities(afterFirstTagStrip)
  const afterSecondTagStrip = stripHtmlTags(afterEntities)
  return afterSecondTagStrip.trim()
}

// ---------------------------------------------------------------------------
// Generischer Extractor: findet den Inhalt zwischen <tag ...> und </tag>
// (einfaches, tolerantes Matching — kein vollstaendiger XML-Parser)
// ---------------------------------------------------------------------------

function extractTagContent(xml: string, tag: string): string {
  // Match opening tag (with optional attributes) and capture content up to closing tag
  const re = new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1] : ''
}

function extractAttrValue(xml: string, tag: string, attr: string): string {
  // e.g. <link href="https://..." /> or <link rel="alternate" href="..." />
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["'][^>]*>`, 'i')
  const m = xml.match(re)
  return m ? m[1] : ''
}

// ---------------------------------------------------------------------------
// Alle Vorkommen eines Tags als Substring-Slices extrahieren
// ---------------------------------------------------------------------------

function extractAllBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = []
  const openTag = `<${tag}`
  const closeTag = `</${tag}>`
  let pos = 0
  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos)
    if (start < 0) break
    const end = xml.indexOf(closeTag, start)
    if (end < 0) break
    blocks.push(xml.slice(start, end + closeTag.length))
    pos = end + closeTag.length
  }
  return blocks
}

// ---------------------------------------------------------------------------
// RSS 2.0 (<item>)
// ---------------------------------------------------------------------------

function parseRssItems(xml: string, sourceName: string): CrawlItem[] {
  const blocks = extractAllBlocks(xml, 'item')
  const items: CrawlItem[] = []
  for (const block of blocks) {
    const title = cleanText(extractTagContent(block, 'title'))
    const description = cleanText(extractTagContent(block, 'description'))

    // <link> in RSS kann Text-Node oder CDATA sein; extractTagContent liefert den Inhalt
    let link = cleanText(extractTagContent(block, 'link'))
    // Fallback: <guid isPermaLink="true">
    if (!link) {
      const guidBlock = extractTagContent(block, 'guid')
      if (guidBlock && /^https?:\/\//.test(guidBlock.trim())) {
        link = guidBlock.trim()
      }
    }

    if (!title || !link) continue
    items.push({ title, summary: description, link, sourceName })
  }
  return items
}

// ---------------------------------------------------------------------------
// Atom (<entry>)
// ---------------------------------------------------------------------------

function parseAtomEntries(xml: string, sourceName: string): CrawlItem[] {
  const blocks = extractAllBlocks(xml, 'entry')
  const items: CrawlItem[] = []
  for (const block of blocks) {
    const title = cleanText(extractTagContent(block, 'title'))

    // summary bevorzugt, Fallback auf content
    const summaryRaw = extractTagContent(block, 'summary') || extractTagContent(block, 'content')
    const summary = cleanText(summaryRaw)

    // <link href="..."> oder Text-Content von <link>
    let link = extractAttrValue(block, 'link', 'href')
    if (!link) {
      link = cleanText(extractTagContent(block, 'link'))
    }
    // Fallback: <id> wenn es eine http-URL ist
    if (!link) {
      const id = cleanText(extractTagContent(block, 'id'))
      if (id && /^https?:\/\//.test(id)) {
        link = id
      }
    }

    if (!title || !link) continue
    items.push({ title, summary, link, sourceName })
  }
  return items
}

// ---------------------------------------------------------------------------
// Haupt-Export
// ---------------------------------------------------------------------------

/**
 * Parst einen RSS 2.0- oder Atom-Feed (XML-String) und gibt CrawlItems zurueck.
 * Gibt [] zurueck bei unparseable Input — wirft nie.
 */
export function parseRssFeed(xml: string, sourceName: string): CrawlItem[] {
  try {
    if (!xml || typeof xml !== 'string') return []
    const trimmed = xml.trim()
    if (!trimmed.startsWith('<')) return []

    // Atom-Feed erkennen: <feed xmlns="...atom..."
    const isAtom =
      /<feed\b/i.test(trimmed) && /xmlns[^=]*=["'][^"']*atom/i.test(trimmed.slice(0, 500))

    if (isAtom) {
      return parseAtomEntries(trimmed, sourceName)
    }
    // RSS 2.0 (Standard-Fall)
    const rssItems = parseRssItems(trimmed, sourceName)
    // Falls keine <item>s gefunden, aber <entry>s vorhanden (Mixed-Feed-Grenzfall)
    if (rssItems.length === 0 && trimmed.includes('<entry')) {
      return parseAtomEntries(trimmed, sourceName)
    }
    return rssItems
  } catch {
    return []
  }
}
