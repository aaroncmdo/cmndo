// CMM-32: Imagin-Studio-Proxy. Demo-Customer (und auch lizenzierte
// Customer mit fehlenden Asset-Lizenzen) liefern HTTP 200 + Header
// `X-Imaginstudio-Error: Access error` mit einem Platzhalter-PNG.
// Der Browser kann das nicht erkennen — `<img onError>` feuert nie.
//
// Diese Route fetched Imagin server-side, prüft den Error-Header und
// returnt 404 wenn kein echtes Asset verfügbar ist. Damit greift im
// Frontend zuverlässig die nächste Fallback-Stufe (Wikipedia → Logo).
//
// Cache: 1 Tag, da Renderings nahezu deterministisch sind.

import { NextRequest } from 'next/server'
import { buildImaginUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const hersteller = sp.get('make')
  const modell = sp.get('model')
  const lackfarbe = sp.get('paint') as LackfarbeCode | null

  const url = buildImaginUrl({ hersteller, modell, lackfarbe })
  if (!url) return new Response('missing-params', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetch(url, { cache: 'no-store' })
  } catch {
    return new Response('upstream-fetch-failed', { status: 502 })
  }

  if (!upstream.ok) {
    return new Response('upstream-error', { status: upstream.status })
  }

  const errorHeader = upstream.headers.get('x-imaginstudio-error')
  if (errorHeader) {
    return new Response(`imagin-access-error: ${errorHeader}`, { status: 404 })
  }

  const buf = await upstream.arrayBuffer()
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
