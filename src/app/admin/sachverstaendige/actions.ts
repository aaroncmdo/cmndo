'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const PAKET_CONFIG: Record<string, { faelle: number; km: number; preis: number }> = {
  standard: { faelle: 10, km: 15, preis: 1500 },
  'starter-10': { faelle: 10, km: 15, preis: 1500 },
  pro: { faelle: 25, km: 40, preis: 3750 },
  'standard-25': { faelle: 25, km: 40, preis: 3750 },
  premium: { faelle: 50, km: 70, preis: 7500 },
  'premium-50': { faelle: 50, km: 70, preis: 7500 },
}

export type OnboardingData = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  gutachter_typ: string
  qualifikationen: string[]
  standort_adresse: string
  standort_plz: string
  standort_lat: number | null
  standort_lng: number | null
  standort_place_id: string | null
  paket: string
}

export async function createSachverstaendiger(formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const email = (formData.get('email') as string)?.trim()
  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = (formData.get('paket') as string) || 'standard'
  const gebietPlzRaw = (formData.get('gebiet_plz') as string)?.trim() || ''
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10

  if (!email) throw new Error('E-Mail ist erforderlich')

  const gebietPlz = gebietPlzRaw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const admin = createAdminClient()
  const tempPassword = crypto.randomUUID().slice(0, 12)

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) throw new Error(`User erstellen fehlgeschlagen: ${authErr.message}`)

  const { error: profileErr } = await admin
    .from('profiles')
    .insert({
      id: authUser.user.id,
      email,
      rolle: 'sachverstaendiger',
      vorname,
      nachname,
      telefon,
    })

  if (profileErr) throw new Error(`Profil erstellen fehlgeschlagen: ${profileErr.message}`)

  const { error: svErr } = await admin
    .from('sachverstaendige')
    .insert({
      profile_id: authUser.user.id,
      paket,
      gebiet_plz: gebietPlz,
      max_faelle_monat: maxFaelle,
    })

  if (svErr) throw new Error(`SV-Eintrag fehlgeschlagen: ${svErr.message}`)

  revalidatePath('/admin/sachverstaendige')

  return { id: authUser.user.id, tempPassword }
}

export async function onboardGutachter(data: OnboardingData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  if (!data.email) throw new Error('E-Mail ist erforderlich')

  const admin = createAdminClient()
  const tempPassword = crypto.randomUUID().slice(0, 12)

  // 1. Auth user erstellen
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) throw new Error(`User erstellen fehlgeschlagen: ${authErr.message}`)

  // 2. Profile erstellen
  const { error: profileErr } = await admin.from('profiles').insert({
    id: authUser.user.id,
    email: data.email,
    rolle: 'sachverstaendiger',
    vorname: data.vorname || null,
    nachname: data.nachname || null,
    telefon: data.telefon || null,
  })

  if (profileErr) throw new Error(`Profil erstellen fehlgeschlagen: ${profileErr.message}`)

  // 3. Paket-Config ableiten
  const paketCfg = PAKET_CONFIG[data.paket] ?? PAKET_CONFIG['standard']

  // 4. SV-Eintrag mit allen neuen Feldern
  const { data: svEntry, error: svErr } = await admin.from('sachverstaendige').insert({
    profile_id: authUser.user.id,
    user_id: authUser.user.id,
    paket: data.paket,
    gutachter_typ: data.gutachter_typ,
    qualifikationen: data.qualifikationen,
    standort_adresse: data.standort_adresse || null,
    standort_plz: data.standort_plz || null,
    standort_lat: data.standort_lat,
    standort_lng: data.standort_lng,
    standort_place_id: data.standort_place_id,
    max_faelle_monat: paketCfg.faelle,
    paket_faelle_gesamt: paketCfg.faelle,
    paket_umkreis_km: paketCfg.km,
    radius_km: paketCfg.km,
    anzahlung_faellig: paketCfg.preis,
    anzahlung_status: 'offen',
    onboarding_abgeschlossen: true,
    partner_seit: new Date().toISOString(),
    ist_aktiv: true,
  }).select('id').single()

  if (svErr) throw new Error(`SV-Eintrag fehlgeschlagen: ${svErr.message}`)

  // 5. Finance-Eintrag fuer Anzahlung
  try {
    await admin.from('finance_eintraege').insert({
      typ: 'gutachter-anzahlung',
      betrag: paketCfg.preis,
      status: 'offen',
      beschreibung: `Gutachter-Anzahlung: ${data.vorname} ${data.nachname} (${data.paket})`,
      referenz_id: svEntry?.id ?? null,
      referenz_typ: 'sachverstaendige',
    })
  } catch {
    // finance_eintraege might not exist yet
  }

  // 6. Isochrone-Berechnung (wenn Koordinaten vorhanden)
  if (data.standort_lat && data.standort_lng && svEntry?.id) {
    try {
      const polygon = await calculateIsochrone(data.standort_lat, data.standort_lng, paketCfg.km)
      if (polygon.length > 0) {
        await admin.from('sachverstaendige')
          .update({ isochrone_polygon: polygon })
          .eq('id', svEntry.id)
      }
    } catch {
      // Isochrone-Berechnung ist nicht kritisch
    }
  }

  // 7. gebiet_plz aus standort_plz setzen
  if (data.standort_plz && svEntry?.id) {
    await admin.from('sachverstaendige')
      .update({ gebiet_plz: [data.standort_plz] })
      .eq('id', svEntry.id)
  }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/finance')

  return { svId: svEntry?.id, tempPassword, email: data.email }
}

// ─── Isochrone-Berechnung (OSRM + Fallback) ───────────────────────────────

const NUM_POINTS = 60

async function calculateIsochrone(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[]> {
  // Generate ray points around center
  const rayPoints: { lat: number; lng: number; angle: number }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const dLat = (radiusKm / 111.32) * Math.cos(angle)
    const dLng = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    rayPoints.push({ lat: lat + dLat, lng: lng + dLng, angle })
  }

  // Try OSRM for real driving distances
  try {
    const coords = [[lng, lat], ...rayPoints.map(p => [p.lng, p.lat])]
      .map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
      .join(';')
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
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
          const scale = airDist > 0 ? radiusKm / driveDist : 1
          const clampedScale = Math.max(0.4, Math.min(1.3, scale))
          return { lat: lat + dLat * clampedScale, lng: lng + dLng * clampedScale }
        })
      }
    }
  } catch {
    // OSRM not available — use fallback
  }

  // Fallback: Seeded pseudo-random polygon
  function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm
  return rayPoints.map((_, i) => {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const factor = (1 - variation + seededRandom(baseSeed + i * 13) * variation * 2)
    const r = radiusKm * factor
    const dLat = (r / 111.32) * Math.cos(angle)
    const dLng = (r / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    return { lat: lat + dLat, lng: lng + dLng }
  })
}
