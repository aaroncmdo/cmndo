// CMM-32: Wikipedia-Thumbnail-Proxy. Sucht via OpenSearch nach
// "<Hersteller> <Modell>", holt das Page-Summary und streamt das
// Thumbnail zurück. Zweite Fallback-Stufe nach Imagin.
//
// Vorteile: völlig kostenlos, deutsche Wikipedia hat für die
// allermeisten KFZ-Modelle ein Press-Foto. Nachteile: keine Lackfarben-
// Variante, Bildqualität variiert, Modell-Generation nicht differenziert.

import { NextRequest } from 'next/server'

export const runtime = 'edge'

type OpenSearchResponse = [string, string[], string[], string[]]

type SummaryResponse = {
  extract?: string
  description?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

const UA = 'Claimondo/1.0 (https://claimondo.de; support@claimondo.de)'

const SUMMARY_BASE = 'https://de.wikipedia.org/api/rest_v1/page/summary/'

async function fetchSummary(title: string): Promise<SummaryResponse | null> {
  try {
    const r = await fetch(SUMMARY_BASE + encodeURIComponent(title), {
      headers: { 'User-Agent': UA },
    })
    if (!r.ok) return null
    return (await r.json()) as SummaryResponse
  } catch {
    return null
  }
}

/** Sucht im Summary-Text nach einer Baujahr-Range (z.B. "2015 bis 2024"
 *  oder "2007–2015") und prüft ob das gewünschte Baujahr drin liegt. */
function summaryMatchesYear(
  summary: SummaryResponse,
  year: number,
): boolean {
  const blob = `${summary.extract ?? ''} ${summary.description ?? ''}`
  const range = blob.match(
    /(19|20)(\d{2})\s*(?:bis|–|—|-)\s*(19|20)(\d{2})/,
  )
  if (range) {
    const from = Number(range[1] + range[2])
    const to = Number(range[3] + range[4])
    return year >= from && year <= to
  }
  // Offene Range "seit 2024"
  const since = blob.match(/seit\s+(19|20)(\d{2})/i)
  if (since) {
    const from = Number(since[1] + since[2])
    return year >= from
  }
  return false
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const make = sp.get('make')?.trim()
  const model = sp.get('model')?.trim()
  const yearStr = sp.get('year')
  const year = yearStr ? Number(yearStr.match(/\d{4}/)?.[0] ?? '') : null
  if (!make) return new Response('missing-make', { status: 404 })

  const query = [make, model].filter(Boolean).join(' ')

  // 1. OpenSearch — bis zu 10 Kandidaten holen damit wir Generationen
  // (z.B. „Audi A4 B8", „Audi A4 B9") matchen können
  const searchUrl =
    `https://de.wikipedia.org/w/api.php?action=opensearch&format=json` +
    `&limit=10&namespace=0&search=${encodeURIComponent(query)}`

  let candidates: string[] = []
  try {
    const sr = await fetch(searchUrl, { headers: { 'User-Agent': UA } })
    if (sr.ok) {
      const data = (await sr.json()) as OpenSearchResponse
      candidates = data[1] ?? []
    }
  } catch {
    /* fall-through, leer */
  }

  // Fallback nur Hersteller wenn Modell nichts brachte
  if (candidates.length === 0 && model) {
    try {
      const sr2 = await fetch(
        `https://de.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&namespace=0&search=${encodeURIComponent(make)}`,
        { headers: { 'User-Agent': UA } },
      )
      if (sr2.ok) {
        const data = (await sr2.json()) as OpenSearchResponse
        candidates = data[1] ?? []
      }
    } catch {
      /* ignore */
    }
  }

  if (candidates.length === 0) {
    return new Response('no-wiki-page', { status: 404 })
  }

  // 2. Summary-Suche — bei mehreren Kandidaten + Baujahr versuchen wir,
  // den Generations-Artikel zu finden dessen Baujahr-Range das gesuchte
  // Jahr enthält. Wenn nichts matcht → ersten Kandidaten als Fallback.
  let chosenSummary: SummaryResponse | null = null
  if (year && candidates.length > 1) {
    for (const cand of candidates) {
      const sum = await fetchSummary(cand)
      if (!sum) continue
      if (summaryMatchesYear(sum, year)) {
        chosenSummary = sum
        break
      }
    }
  }
  if (!chosenSummary) {
    chosenSummary = await fetchSummary(candidates[0])
  }
  if (!chosenSummary) return new Response('summary-failed', { status: 404 })

  const imageUrl =
    chosenSummary.originalimage?.source ?? chosenSummary.thumbnail?.source ?? null

  if (!imageUrl) return new Response('no-image', { status: 404 })

  // 3. Bild streamen
  let img: Response
  try {
    img = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
  } catch {
    return new Response('image-fetch-failed', { status: 502 })
  }
  if (!img.ok) return new Response('image-upstream-error', { status: img.status })

  const buf = await img.arrayBuffer()
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': img.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
