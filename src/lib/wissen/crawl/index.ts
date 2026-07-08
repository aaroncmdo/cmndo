import { createHash } from 'node:crypto'
import type { CrawlSource } from './sources'
import type { CrawlItem } from './rss'
import { parseRssFeed } from './rss'

export type { CrawlItem }

const CRAWL_TIMEOUT_MS = 10_000
const USER_AGENT = 'ClaimondoBot/1.0 (+https://claimondo.de)'

/**
 * SHA-256-Hash der URL als Hex-String (64 Zeichen).
 * Deterministisch und kollisionsarm — geeignet als Dedup-Key.
 */
export function sourceHash(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

/**
 * Ladet einen einzelnen Feed und gibt CrawlItems zurueck.
 * Resilient: Jeder Fehler (Netz, Timeout, HTTP-Fehler, Parse-Fehler) wird
 * per console.error geloggt und fuehrt zu [] — niemals throw.
 */
export async function crawlSource(s: CrawlSource): Promise<CrawlItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS)
  try {
    const response = await fetch(s.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })
    if (!response.ok) {
      console.error(`[crawl] ${s.name}: HTTP ${response.status} ${response.statusText}`)
      return []
    }
    const text = await response.text()
    return parseRssFeed(text, s.name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[crawl] ${s.name}:`, msg)
    return []
  } finally {
    clearTimeout(timeout)
  }
}
