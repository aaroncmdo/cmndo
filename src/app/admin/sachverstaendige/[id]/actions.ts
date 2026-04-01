'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PAKET_KM: Record<string, number> = {
  standard: 15, 'starter-10': 15,
  pro: 40, 'standard-25': 40,
  premium: 70, 'premium-50': 70,
}

export async function updateSvProfile(svId: string, profileId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = formData.get('paket') as string
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10
  const istAktiv = formData.get('ist_aktiv') === 'true'
  const notizen = (formData.get('notizen') as string)?.trim() || null

  // Standort from Google Places
  const standortAdresse = (formData.get('standort_adresse') as string)?.trim() || null
  const standortPlz = (formData.get('standort_plz') as string)?.trim() || null
  const standortLatStr = formData.get('standort_lat') as string
  const standortLngStr = formData.get('standort_lng') as string
  const standortLat = standortLatStr ? parseFloat(standortLatStr) : null
  const standortLng = standortLngStr ? parseFloat(standortLngStr) : null
  const standortPlaceId = (formData.get('standort_place_id') as string)?.trim() || null

  const radiusKm = PAKET_KM[paket] ?? 15

  // Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', profileId)

  if (profileErr) throw new Error(`Profil-Update fehlgeschlagen: ${profileErr.message}`)

  // Update sachverstaendige
  const svUpdate: Record<string, unknown> = {
    paket,
    max_faelle_monat: maxFaelle,
    ist_aktiv: istAktiv,
    notizen,
    standort_adresse: standortAdresse,
    standort_plz: standortPlz,
    standort_lat: standortLat,
    standort_lng: standortLng,
    standort_place_id: standortPlaceId,
    paket_umkreis_km: radiusKm,
    radius_km: radiusKm,
  }

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update(svUpdate)
    .eq('id', svId)

  if (svErr) throw new Error(`SV-Update fehlgeschlagen: ${svErr.message}`)

  // Isochrone neu berechnen wenn Koordinaten vorhanden
  if (standortLat != null && standortLng != null && !isNaN(standortLat) && !isNaN(standortLng)) {
    try {
      const polygon = await calculateIsochrone(standortLat, standortLng, radiusKm)
      if (polygon.length > 0) {
        await supabase.from('sachverstaendige').update({ isochrone_polygon: polygon }).eq('id', svId)
      }
    } catch {
      // Isochrone-Berechnung nicht kritisch
    }
  }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
}

// ─── Isochrone-Berechnung (OSRM + Fallback) ───────────────────────────────

const NUM_POINTS = 16

async function calculateIsochrone(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[]> {
  const rayPoints: { lat: number; lng: number; angle: number }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const dLat = (radiusKm / 111.32) * Math.cos(angle)
    const dLng = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    rayPoints.push({ lat: lat + dLat, lng: lng + dLng, angle })
  }

  try {
    const coords = [[lng, lat], ...rayPoints.map(p => [p.lng, p.lat])]
      .map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join(';')
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 'Ok' && data.distances?.[0]) {
        const driveDistances: number[] = data.distances[0].slice(1).map((d: number) => d / 1000)
        return rayPoints.map((p, i) => {
          const driveDist = driveDistances[i]
          if (!driveDist || driveDist <= 0) return { lat: p.lat, lng: p.lng }
          const dLat = p.lat - lat
          const dLng = p.lng - lng
          const airDist = Math.sqrt((dLat * 111.32) ** 2 + (dLng * 111.32 * Math.cos(lat * Math.PI / 180)) ** 2)
          const scale = Math.max(0.4, Math.min(1.3, airDist > 0 ? radiusKm / driveDist : 1))
          return { lat: lat + dLat * scale, lng: lng + dLng * scale }
        })
      }
    }
  } catch { /* fallback */ }

  function seededRandom(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 49297; return x - Math.floor(x) }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm
  return rayPoints.map((_, i) => {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const factor = 1 - variation + seededRandom(baseSeed + i * 13) * variation * 2
    const dLat = (radiusKm * factor / 111.32) * Math.cos(angle)
    const dLng = (radiusKm * factor / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    return { lat: lat + dLat, lng: lng + dLng }
  })
}
