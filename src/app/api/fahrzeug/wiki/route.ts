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
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

const UA = 'Claimondo/1.0 (https://claimondo.de; support@claimondo.de)'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const make = sp.get('make')?.trim()
  const model = sp.get('model')?.trim()
  if (!make) return new Response('missing-make', { status: 404 })

  const query = [make, model].filter(Boolean).join(' ')

  // 1. OpenSearch — finde besten Wikipedia-Artikel
  const searchUrl =
    `https://de.wikipedia.org/w/api.php?action=opensearch&format=json` +
    `&limit=1&namespace=0&search=${encodeURIComponent(query)}`

  let title: string | null = null
  try {
    const sr = await fetch(searchUrl, { headers: { 'User-Agent': UA } })
    if (sr.ok) {
      const data = (await sr.json()) as OpenSearchResponse
      title = data[1]?.[0] ?? null
    }
  } catch {
    /* fall-through, title bleibt null */
  }

  // Fallback nur Hersteller wenn Modell nichts brachte
  if (!title && model) {
    try {
      const sr2 = await fetch(
        `https://de.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(make)}`,
        { headers: { 'User-Agent': UA } },
      )
      if (sr2.ok) {
        const data = (await sr2.json()) as OpenSearchResponse
        title = data[1]?.[0] ?? null
      }
    } catch {
      /* ignore */
    }
  }

  if (!title) return new Response('no-wiki-page', { status: 404 })

  // 2. REST-Summary — Thumbnail-URL
  const summaryUrl = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  let imageUrl: string | null = null
  try {
    const sr = await fetch(summaryUrl, { headers: { 'User-Agent': UA } })
    if (!sr.ok) return new Response('summary-failed', { status: 404 })
    const data = (await sr.json()) as SummaryResponse
    imageUrl = data.originalimage?.source ?? data.thumbnail?.source ?? null
  } catch {
    return new Response('summary-fetch-error', { status: 502 })
  }

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
