// Doc 34 Task 0b.1 — Public JSON-API fuer SVs im Umkreis (LLM-/Custom-GPT-Konsum).
// GET /api/v1/sv-in-naehe?plz=50670&radius=30
// Anonyme Public-API mit CORS (ChatGPT-Actions) + In-Process-IP-Rate-Limit.
// Liefert strukturierte SV-Liste (anonymisiert, Privacy wie Marketing-Karte)
// + karte_url (0a.1) + Hand-Off-Links + Brand-_meta.
// /api/v1-versioniert: Foundation fuer Doc 33 Phase 2 (MCP) — ergaenzt statt migriert.
import { NextResponse } from 'next/server'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { haversineKm } from '@/lib/geo/distance'
import { SITE_URL, PHONE_DISPLAY } from '@/lib/seo/jsonld'

// Server-Actions (Supabase-Cookie- + Admin-Client) -> Node-Runtime.
export const runtime = 'nodejs'

const RADIUS_DEFAULT = 30
const RADIUS_MAX = 200
const MAX_RESULTS = 50

// In-Process-IP-Rate-Limit (PM2-Single-Process, kein DB-Cost auf dem heissen
// public Endpoint): 60 Requests/Minute pro IP, Sliding-Window.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
const ipHits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  ipHits.set(ip, hits)
  // Opportunistisches Cleanup, damit die Map nicht unbegrenzt waechst.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k)
    }
  }
  return hits.length > RATE_MAX
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded (60 requests/minute)' },
      { status: 429, headers: { ...CORS, 'Retry-After': '60' } },
    )
  }

  const url = new URL(req.url)
  const plz = url.searchParams.get('plz')
  const radiusRaw = parseInt(
    url.searchParams.get('radius') ?? String(RADIUS_DEFAULT),
    10,
  )
  const radiusKm = Math.min(
    RADIUS_MAX,
    Math.max(1, Number.isFinite(radiusRaw) ? radiusRaw : RADIUS_DEFAULT),
  )

  if (!plz || !/^\d{5}$/.test(plz)) {
    return NextResponse.json(
      { error: 'plz required (5-digit German postal code)' },
      { status: 400, headers: CORS },
    )
  }

  const center = await geocodeAdresse(plz)
  if (!center) {
    return NextResponse.json(
      { error: 'PLZ not found' },
      { status: 404, headers: CORS },
    )
  }

  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const tier1 = aktiveRes.ok ? aktiveRes.data : []
  const tier3 = leadsRes.ok ? leadsRes.data : []

  // Tier-1: anonymisiertes Profil NUR fuer paket='standard' (Loader nullt den
  // Rest). Tier-3: nur Distanz (Privacy wie auf der Marketing-Karte — Dead-Pin).
  const tier1Liste = tier1
    .filter((s) => Number.isFinite(s.standort_lat) && Number.isFinite(s.standort_lng))
    .map((s) => ({
      tier: 1 as const,
      stadt: s.stadt,
      vorname_initiale: s.vorname_initiale,
      spezialisierungen: s.spezifikationen_top3,
      bewertung_schnitt: s.bewertungs_durchschnitt,
      bewertung_anzahl: s.bewertungs_anzahl,
      entfernung_km:
        Math.round(haversineKm(center.lat, center.lng, s.standort_lat, s.standort_lng) * 10) / 10,
    }))
    .filter((s) => s.entfernung_km <= radiusKm)

  const tier3Liste = tier3
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({
      tier: 3 as const,
      entfernung_km:
        Math.round(haversineKm(center.lat, center.lng, s.lat, s.lng) * 10) / 10,
    }))
    .filter((s) => s.entfernung_km <= radiusKm)

  const sv_liste = [...tier1Liste, ...tier3Liste]
    .sort((a, b) => a.entfernung_km - b.entfernung_km)
    .slice(0, MAX_RESULTS)

  return NextResponse.json(
    {
      plz,
      radius_km: radiusKm,
      center: { lat: center.lat, lng: center.lng },
      anzahl_treffer: sv_liste.length,
      sv_liste,
      karte_url: `${SITE_URL}/api/v1/karte/${plz}.png`,
      interaktive_karte_url: `${SITE_URL}/gutachter-finden?plz=${plz}`,
      buchungs_telefon: PHONE_DISPLAY,
      _meta: {
        quelle: 'Claimondo Public API',
        stand: new Date().toISOString().slice(0, 10),
        hinweis:
          'Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
        kontakt: `${PHONE_DISPLAY} · Mo–Fr 08–20, Sa+So 09–18 Uhr`,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        ...CORS,
      },
    },
  )
}
