import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { haversineKm } from '@/lib/gps/geofence'

// ─── OSRM Routing ──────────────────────────────────────────────────────────

async function getOsrmDuration(
  vonLat: number, vonLng: number,
  nachLat: number, nachLng: number,
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${vonLng},${vonLat};${nachLng},${nachLat}?overview=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    return Math.ceil(data.routes[0].duration) // Sekunden
  } catch {
    return null
  }
}


// ─── Cache Helpers ─────────────────────────────────────────────────────────

function coordHash(lat: number, lng: number): string {
  return createHash('sha256').update(`${lat.toFixed(4)},${lng.toFixed(4)}`).digest('hex').slice(0, 16)
}

const CACHE_TTL_DAYS = 7

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Berechnet Fahrtzeit in Sekunden zwischen zwei Koordinaten.
 * 1. Prüft routing_cache (TTL 7 Tage)
 * 2. OSRM API
 * 3. Fallback: Luftlinie × 1.4 ÷ 60km/h
 */
export async function berechneFahrtzeit(
  vonLat: number, vonLng: number,
  nachLat: number, nachLng: number,
): Promise<number> {
  const vonH = coordHash(vonLat, vonLng)
  const nachH = coordHash(nachLat, nachLng)
  const supabase = createAdminClient()

  // 1. Cache prüfen
  const ttlCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString()
  const { data: cached } = await supabase
    .from('routing_cache')
    .select('fahrtzeit_sek')
    .eq('von_hash', vonH)
    .eq('nach_hash', nachH)
    .gte('cached_at', ttlCutoff)
    .single()

  if (cached) return cached.fahrtzeit_sek

  // 2. OSRM API
  const osrmSek = await getOsrmDuration(vonLat, vonLng, nachLat, nachLng)

  if (osrmSek !== null) {
    // In Cache schreiben
    await supabase.from('routing_cache').upsert({
      von_hash: vonH,
      nach_hash: nachH,
      fahrtzeit_sek: osrmSek,
      cached_at: new Date().toISOString(),
    })
    return osrmSek
  }

  // 3. Fallback: Luftlinie × 1.4 ÷ 60km/h
  const km = haversineKm(vonLat, vonLng, nachLat, nachLng)
  const fallbackSek = Math.ceil((km * 1.4 / 60) * 3600)
  console.warn(`[routing] OSRM fehlgeschlagen, Fallback Luftlinie: ${km.toFixed(1)}km → ${Math.ceil(fallbackSek / 60)}min`)

  // Fallback auch cachen (kurzer TTL durch nächsten realen Aufruf überschrieben)
  await supabase.from('routing_cache').upsert({
    von_hash: vonH,
    nach_hash: nachH,
    fahrtzeit_sek: fallbackSek,
    cached_at: new Date().toISOString(),
  })

  return fallbackSek
}
