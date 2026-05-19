import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  pointInRing,
  isValidPolygon,
  extractStadt,
  firstInitial,
  isTestAccount,
  sample,
  isValidPlaceId,
  type GutachterProfilPublic,
} from './_lib'

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
//
// Helper (pointInRing, isValidPolygon, extractStadt, firstInitial,
// isTestAccount, sample, isValidPlaceId) leben in ./_lib.ts — pure
// functions damit sie unit-testbar sind. Diese Route bleibt der
// Glue-Layer (Fetch, DB-Queries, Min-Loading-Delay).

export const runtime = 'nodejs'

const PROFILE_STACK_LIMIT = 3
const MIN_LOADING_MS = 600 // Wahrnehmungs-Untergrenze "System arbeitet"

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
  if (!isValidPlaceId(placeId)) {
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

  // 2. Map-ready SVs holen — Tier-1 (verifizierte sachverstaendige) für Count
  //    + Profile-Stack, Tier-3 (sv_leads, Excel-Importe ohne Pakete) NUR für
  //    den Count. Gleiches Pattern wie /gutachter-finden: Tier-3 sind auf der
  //    Karte anonyme Dead-Pins, hier zählen sie nur in die Trust-Zahl.
  //
  //    Aaron 2026-05-19: ohne sv_leads ist die Region-Zahl (3 in Köln) zu
  //    klein für die Conversion-Wirkung. Mit Tier-3 ist sie realistischer
  //    (>30 in Köln), Privacy bleibt gewahrt weil weder Profile noch
  //    Avatar/Reviews aus sv_leads zurück gehen.
  const sb = createServiceClient()
  const [tier1Res, tier3Res] = await Promise.all([
    sb
      .from('sachverstaendige')
      .select(
        'id, isochrone_polygon, paket, profile_id, firmenname, standort_adresse',
      )
      .eq('verifiziert', true)
      .eq('ist_aktiv', true)
      .is('geloescht_am', null)
      .not('isochrone_polygon', 'is', null),
    sb
      .from('sv_leads')
      .select('id, isochrone_polygon')
      .eq('ist_aktiv', true)
      .not('isochrone_polygon', 'is', null),
  ])

  if (tier1Res.error || !tier1Res.data) {
    console.error(
      '[gutachter-verfuegbar] SV-Query Fehler:',
      tier1Res.error?.message ?? 'no data',
    )
    return NextResponse.json(
      { ok: false, error: 'sv_query_failed' },
      { status: 502 },
    )
  }
  const svs = tier1Res.data
  const svLeads = tier3Res.data ?? []
  if (tier3Res.error) {
    // Tier-3 ist nicht-kritisch — Count fällt nur auf Tier-1 zurück, kein Fail.
    console.warn(
      '[gutachter-verfuegbar] sv_leads-Query Fehler (fallback Tier-1-only):',
      tier3Res.error.message,
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

  // Tier-3 sv_leads — nur Point-in-Polygon, kein Test-Account-Filter (sv_leads
  // haben keine firmenname-Spalte, sind Excel-Importe). Polygon-Validation
  // ist Pflicht weil Legacy-Array-Format auch hier vorkommen kann.
  for (const row of svLeads) {
    const poly = row.isochrone_polygon
    if (!isValidPolygon(poly)) {
      skipped++
      continue
    }
    if (pointInRing(point, poly.coordinates[0])) count++
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
