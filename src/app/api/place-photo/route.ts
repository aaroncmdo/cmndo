// CMM-29: Proxy für Google Places Foto-API.
// Der API-Key bleibt server-side — Client übergibt nur den photo_reference.
import { NextResponse } from 'next/server'

// photo_reference ist ein Base64url-String, maximal ~500 Zeichen.
const REF_PATTERN = /^[A-Za-z0-9_\-]+$/

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ref = searchParams.get('ref')

  if (!ref || !REF_PATTERN.test(ref) || ref.length > 600) {
    return NextResponse.json({ error: 'Ungültige Referenz' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Nicht konfiguriert' }, { status: 500 })
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=400&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`

  const upstream = await fetch(url, { redirect: 'follow' })

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Foto nicht verfügbar' }, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const body = await upstream.arrayBuffer()

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
    },
  })
}
