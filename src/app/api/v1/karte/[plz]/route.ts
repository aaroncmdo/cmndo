// Token-Audit-Skip: Mapbox-Static-API-Marker brauchen rohe Hex-Farben (ohne #)
//   im URL-String — kein Tailwind/CSS-Var-Kontext. Analog zu den 4 SV-Typ-Map-
//   Marker-Farben (AAR-198). Siehe src/lib/external-brand-colors.ts und
//   AGENTS.md §branding-rules.
//
// Doc 34 Task 0a.1 — Static-Map-Image-API fuer LLM-Embedding.
// GET /api/v1/karte/[plz].png -> PNG-Karte (Mapbox Static Images API) mit allen
// Partner-SVs im 30km-Radius. LLMs (ChatGPT/Claude/Perplexity/Gemini) koennen
// das Bild direkt im Chat embedden; llms.txt verweist darauf.
// /api/v1-versioniert: Foundation fuer Doc 33 Phase 2 (MCP), ergaenzt statt migriert.
import { NextResponse } from 'next/server'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { haversineKm } from '@/lib/geo/distance'

// ladeAktiveSVs/ladeSvLeads sind Server-Actions (Supabase-Cookie- + Admin-
// Client) -> Node-Runtime, NICHT Edge.
export const runtime = 'nodejs'

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const MAPBOX_STYLE = 'mapbox/streets-v12'

// Claimondo-Marker-Farben (Mapbox erwartet Hex OHNE #).
const COLOR_TIER1 = '4573A2' // claimondo-ondo — Tier-1 Partner mit Profil
const COLOR_TIER3 = '7BA3CC' // claimondo-light-blue — Tier-3 Dead-Pins
const COLOR_CENTER = '0D1B3E' // claimondo-navy — PLZ-Zentrum

const RADIUS_KM = 30
const MAX_MARKER = 48 // Mapbox-Static-Overlay-Limit ~50; Platz fuer Center-Pin lassen
const WIDTH = 800
const HEIGHT = 600
const ZOOM = 10

// In-Process-Cache gegen Mapbox-Cost: identische PLZ innerhalb 1h liefert das
// gecachte PNG (PM2-Single-Process). Cache-Control/CDN deckt den Rest ab.
const CACHE_TTL_MS = 60 * 60 * 1000
const pngCache = new Map<string, { png: ArrayBuffer; ts: number }>()

function buildMarkers(
  center: { lat: number; lng: number },
  svs: Array<{ lat: number; lng: number; color: string }>,
): string {
  const pins = svs.map(
    (s) => `pin-s+${s.color}(${s.lng.toFixed(5)},${s.lat.toFixed(5)})`,
  )
  // Zentrum als grosser Pin zuletzt (liegt oben).
  pins.push(
    `pin-l+${COLOR_CENTER}(${center.lng.toFixed(5)},${center.lat.toFixed(5)})`,
  )
  return pins.join(',')
}

function pngResponse(png: ArrayBuffer, plz: string): NextResponse {
  return new NextResponse(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Browser 1h, CDN 24h, danach 7 Tage stale-while-revalidate.
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Robots-Tag': 'index', // LLM-/Such-Crawler duerfen das Bild indexieren
      'Content-Disposition': `inline; filename="claimondo-gutachter-karte-${plz}.png"`,
    },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ plz: string }> },
) {
  if (!MAPBOX_TOKEN) {
    return NextResponse.json({ error: 'Map nicht konfiguriert' }, { status: 503 })
  }

  // Route-Segment faengt optional ".png": /api/v1/karte/50670.png ODER /50670.
  const seg = (await params).plz.replace(/\.png$/i, '')

  // Doc 34 0b.3: ?lat&lng ueberschreibt die PLZ-Geocodierung — z.B. die
  // Stadt-OG nutzt Stadt-Koordinaten (STAEDTE hat lat/lng, aber keine einzelne
  // PLZ). Das Segment ist dann nur ein Label (Slug) fuer Filename/Lesbarkeit.
  const url = new URL(req.url)
  const latNum = Number(url.searchParams.get('lat'))
  const lngNum = Number(url.searchParams.get('lng'))
  const hasCoords =
    url.searchParams.has('lat') &&
    url.searchParams.has('lng') &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum)

  let center: { lat: number; lng: number } | null = null
  let cacheKey: string
  let label: string

  if (hasCoords) {
    // DE-Bounding-Box-Guard: beliebige Welt-Koordinaten = unnoetiger Mapbox-Cost.
    if (latNum < 47 || latNum > 56 || lngNum < 5 || lngNum > 16) {
      return NextResponse.json(
        { error: 'lat/lng ausserhalb Deutschland' },
        { status: 400 },
      )
    }
    center = { lat: latNum, lng: lngNum }
    cacheKey = `geo:${latNum.toFixed(4)},${lngNum.toFixed(4)}`
    label = /^[a-z0-9-]{1,40}$/i.test(seg) ? seg : 'region'
  } else {
    if (!/^\d{5}$/.test(seg)) {
      return NextResponse.json(
        { error: 'Ungueltige PLZ (5-stellig) oder lat/lng erforderlich' },
        { status: 400 },
      )
    }
    cacheKey = `plz:${seg}`
    label = seg
  }

  const cached = pngCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return pngResponse(cached.png, label)
  }

  if (!center) {
    center = await geocodeAdresse(seg)
    if (!center) {
      return NextResponse.json({ error: 'PLZ nicht gefunden' }, { status: 404 })
    }
  }

  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const tier1 = aktiveRes.ok ? aktiveRes.data : []
  const tier3 = leadsRes.ok ? leadsRes.data : []

  const svs = [
    ...tier1.map((s) => ({
      lat: s.standort_lat,
      lng: s.standort_lng,
      color: COLOR_TIER1,
    })),
    ...tier3.map((s) => ({ lat: s.lat, lng: s.lng, color: COLOR_TIER3 })),
  ]
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, d: haversineKm(center.lat, center.lng, s.lat, s.lng) }))
    .filter((s) => s.d <= RADIUS_KM)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_MARKER)

  const markers = buildMarkers(center, svs)
  const mapboxUrl =
    `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}` +
    `/${center.lng.toFixed(5)},${center.lat.toFixed(5)},${ZOOM}/${WIDTH}x${HEIGHT}@2x` +
    `?access_token=${MAPBOX_TOKEN}`

  let mapRes: Response
  try {
    mapRes = await fetch(mapboxUrl, { signal: AbortSignal.timeout(8_000) })
  } catch {
    return NextResponse.json(
      { error: 'Map-Generierung fehlgeschlagen' },
      { status: 502 },
    )
  }
  if (!mapRes.ok) {
    return NextResponse.json(
      { error: 'Map-Generierung fehlgeschlagen' },
      { status: 502 },
    )
  }

  const png = await mapRes.arrayBuffer()
  pngCache.set(cacheKey, { png, ts: Date.now() })
  return pngResponse(png, label)
}
