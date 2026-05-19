import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// API für den Scroll-Popover (Step 2): nimmt eine Google-Place-ID,
// löst sie über die Places-Details-API in lat/lng auf, zählt
// verifizierte Sachverständige deren Isochrone den Punkt abdecken
// und liefert zusätzlich bis zu 3 Profile (Initial + Stadt + Avatar
// + Google-Reviews-Aggregat) für den Trust-Avatar-Stack.
//
// Spec: Aaron-Wunsch 2026-05-19. Phase 1 = Count + Profile-Stack.
//
// Isochrone-Format: GeoJSON-Polygon mit closed LinearRing (Aaron-
// Hotfix a335539d). Point-in-Polygon wird in JS gerechnet — kein
// PostGIS-Setup nötig, ~50 SVs in NRW × ~200 Vertices = <50 ms.
//
// Privacy-Pattern matcht ladeAktiveSVs (gutachter-finder-actions.ts):
// nur paket='standard' zeigt Initial/Stadt/Avatar/Reviews, alle
// anderen Pakete laufen zwar in den Count ein, sind aber anonym.
// Test-Accounts (Firmenname enthält test/smoke/demo) werden raus-
// gefiltert.

export const runtime = 'nodejs'

const PROFILE_STACK_LIMIT = 3
const MIN_LOADING_MS = 600 // Wahrnehmungs-Untergrenze "System arbeitet"

type GeoPolygon = {
  type: 'Polygon'
  coordinates: number[][][] // [outer ring [, hole rings…]]
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

// Ray-Casting Point-in-Polygon. point = [lng, lat] (GeoJSON-Order),
// ring = Array<[lng, lat]>. Holes werden ignoriert — Isochronen
// haben in unserem Schema keine.
function pointInRing(point: [number, number], ring: number[][]): boolean {
  if (!isClosedRing(ring)) return false
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function isValidPolygon(poly: unknown): poly is GeoPolygon {
  if (!poly || typeof poly !== 'object') return false
  const p = poly as { type?: unknown; coordinates?: unknown }
  if (p.type !== 'Polygon') return false
  if (!Array.isArray(p.coordinates) || p.coordinates.length === 0) return false
  const ring = p.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4
}

// Inline-Duplikat von gutachter-finder-actions.ts:extractStadt — bewusst nicht
// importiert, weil das eine 'use server'-Datei ist und Imports daraus auf den
// Client-Bundle als undefined gespiegelt werden (siehe AGENTS.md §use-server-
// Konstanten-Falle). 5 Zeilen sind das wert.
function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? `${trimmed.charAt(0).toUpperCase()}.` : null
}

function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

// Fisher-Yates-Shuffle: für den Profile-Stack ein zufälliges 3er-Sample, damit
// nicht immer dieselben Köpfe erscheinen wenn der User mehrere Adressen
// durchprobiert.
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice()
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export type GutachterProfilPublic = {
  id: string
  vorname_initiale: string | null
  stadt: string | null
  avatar_url: string | null
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}

export async function POST(req: Request) {
  const t0 = Date.now()
  let body: { placeId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  const placeId = String(body.placeId ?? '').trim()
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(placeId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid place_id' },
      { status: 400 },
    )
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[gutachter-verfuegbar] GOOGLE_PLACES_API_KEY fehlt')
    return NextResponse.json(
      { ok: false, error: 'maps_unavailable' },
      { status: 503 },
    )
  }

  // 1. Place-Details → lat/lng. Next-Cache 1 h, damit wiederholte
  //    Klicks auf dieselbe Adresse kein neues Places-Billing-Event
  //    triggern.
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'geometry/location')
  url.searchParams.set('language', 'de')
  url.searchParams.set('key', apiKey)

  let placeRes: Response
  try {
    placeRes = await fetch(url.toString(), { next: { revalidate: 3600 } })
  } catch (e) {
    console.error('[gutachter-verfuegbar] places fetch threw:', e)
    return NextResponse.json(
      { ok: false, error: 'maps_unavailable' },
      { status: 502 },
    )
  }
  if (!placeRes.ok) {
    return NextResponse.json(
      { ok: false, error: `maps_status_${placeRes.status}` },
      { status: 502 },
    )
  }
  const placeData = (await placeRes.json()) as {
    status?: string
    result?: { geometry?: { location?: { lat?: number; lng?: number } } }
  }
  const loc = placeData?.result?.geometry?.location
  if (
    placeData.status !== 'OK' ||
    !loc ||
    typeof loc.lat !== 'number' ||
    typeof loc.lng !== 'number'
  ) {
    return NextResponse.json(
      { ok: false, error: 'no_location' },
      { status: 502 },
    )
  }

  const lat = loc.lat
  const lng = loc.lng

  // 2. Map-ready SVs holen (gleicher Filter wie die anon-Map-View).
  const sb = createServiceClient()
  const { data: svs, error: svErr } = await sb
    .from('sachverstaendige')
    .select(
      'id, isochrone_polygon, paket, profile_id, firmenname, standort_adresse',
    )
    .eq('verifiziert', true)
    .eq('ist_aktiv', true)
    .is('geloescht_am', null)
    .not('isochrone_polygon', 'is', null)

  if (svErr || !svs) {
    console.error(
      '[gutachter-verfuegbar] SV-Query Fehler:',
      svErr?.message ?? 'no data',
    )
    return NextResponse.json(
      { ok: false, error: 'sv_query_failed' },
      { status: 502 },
    )
  }

  // 3. Point-in-Polygon für jede Isochrone. Wir filtern auch Test-Accounts
  //    raus, damit "Test Aaron Gutachter GmbH" weder in den Count noch in
  //    den Profile-Stack rutscht.
  const point: [number, number] = [lng, lat]
  let count = 0
  let skipped = 0
  const matchingStandard: typeof svs = []
  for (const row of svs) {
    const poly = row.isochrone_polygon
    if (!isValidPolygon(poly)) {
      skipped++
      continue
    }
    if (isTestAccount(row.firmenname as string | null)) continue
    if (!pointInRing(point, poly.coordinates[0])) continue
    count++
    if (row.paket === 'standard' && row.profile_id) {
      matchingStandard.push(row)
    }
  }

  if (skipped > 0) {
    console.warn(
      `[gutachter-verfuegbar] ${skipped} SV-Polygone übersprungen (invalides GeoJSON)`,
    )
  }

  // 4. Profile-Stack: bis zu 3 zufällige Standard-SVs aus den Matches.
  //    Reads aus profiles + google_bewertungen_cache via Admin-Client
  //    (anon-RLS würde diese Tabellen blocken).
  const stackRows = sample(matchingStandard, PROFILE_STACK_LIMIT)
  const profileIds = stackRows
    .map((r) => r.profile_id as string | null)
    .filter((x): x is string => Boolean(x))

  const vornameByProfile = new Map<string, string | null>()
  const avatarByProfile = new Map<string, string | null>()
  const bewertungByProfile = new Map<
    string,
    { durchschnitt: number; anzahl: number }
  >()

  if (profileIds.length > 0) {
    const admin = createAdminClient()
    const [profilesRes, bewRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, vorname, avatar_url')
        .in('id', profileIds),
      admin
        .from('google_bewertungen_cache')
        .select('profile_id, durchschnitt, anzahl_bewertungen')
        .in('profile_id', profileIds),
    ])
    for (const p of profilesRes.data ?? []) {
      vornameByProfile.set(p.id, p.vorname)
      avatarByProfile.set(p.id, p.avatar_url)
    }
    for (const b of bewRes.data ?? []) {
      bewertungByProfile.set(b.profile_id, {
        durchschnitt: Number(b.durchschnitt),
        anzahl: b.anzahl_bewertungen ?? 0,
      })
    }
  }

  const gutachter: GutachterProfilPublic[] = stackRows.map((r) => {
    const pid = r.profile_id as string
    const bew = bewertungByProfile.get(pid)
    return {
      id: r.id,
      vorname_initiale: firstInitial(vornameByProfile.get(pid) ?? null),
      stadt: extractStadt(r.standort_adresse as string | null),
      avatar_url: avatarByProfile.get(pid) ?? null,
      bewertungs_durchschnitt: bew ? bew.durchschnitt : null,
      bewertungs_anzahl: bew ? bew.anzahl : null,
    }
  })

  // 5. Mindest-Loading-Zeit erzwingen, damit der "System arbeitet"-Effekt
  //    auch bei warmem Cache (<100 ms Antwort) sichtbar bleibt.
  const elapsed = Date.now() - t0
  if (elapsed < MIN_LOADING_MS) {
    await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed))
  }

  return NextResponse.json({ ok: true, count, gutachter })
}
