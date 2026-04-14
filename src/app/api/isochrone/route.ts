// AAR-132: API-Route nutzt jetzt die zentrale calculateIsochrone-Funktion
// mit HERE API. Kein lokaler Fallback mehr — bei Fehler 503 zurückgeben,
// der Client (KarteClient etc.) entscheidet selbst was er dann macht.
import { NextRequest, NextResponse } from 'next/server'
import { calculateIsochrone, IsochroneError } from '@/lib/isochrone/calculate-isochrone'

// Prozess-lokaler Cache — HERE-Calls kosten Geld, in derselben Edge-Instanz
// nicht mehrmals pro Standort abrufen.
const cache = new Map<string, { lat: number; lng: number }[]>()

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const radiusKm = parseFloat(req.nextUrl.searchParams.get('radius_km') ?? '15')

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm)) {
    return NextResponse.json({ error: 'lat, lng und radius_km erforderlich' }, { status: 400 })
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`
  const cached = cache.get(cacheKey)
  if (cached) {
    return NextResponse.json({ polygon: cached, source: 'cache' })
  }

  try {
    const polygon = await calculateIsochrone(lat, lng, radiusKm)
    cache.set(cacheKey, polygon)
    return NextResponse.json({ polygon, source: 'here' })
  } catch (err) {
    const message = err instanceof IsochroneError ? err.message : 'Unbekannter Fehler'
    console.error('[api/isochrone]', message, err)
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
