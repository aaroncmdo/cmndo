// AAR-50: Dispatch-Algorithmus — findBestSV
// Findet die besten Sachverständigen für einen Fall basierend auf:
// - Aktivität + nicht gesperrt
// - Urlaub-Check
// - Kontingent (Paket-Limit vs. genutzte Fälle)
// - Distanz (Isochrone oder Radius)
// - Paket-Prio (premium > pro > standard)
// - Balance (wenig offene Fälle bevorzugt)
// - Ablehnungsrate (wenig Ablehnungen bevorzugt)

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from './isochrone-parse'
import { applyDispatchableFilter } from '@/lib/sv/queries'

export type SvMatchInput = {
  fallLat: number
  fallLng: number
  terminDatum?: string // ISO-Datum optional (für Urlaub-Check)
  // AAR-264: Wunschtermin des Kunden — wenn gesetzt, prüfen wir pro SV ob er
  // im ±wunschterminFensterMin-Fenster bereits einen anderen Termin hat.
  wunschterminIso?: string | null
  wunschterminFensterMin?: number
}

export type SvMatchCandidate = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  // Badge-Gründe für UI
  reasons: string[]
  // AAR-264: Wunschtermin-Verfügbarkeit (nur gesetzt wenn wunschterminIso übergeben)
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}

const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Point-in-polygon (ray-casting)
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export async function findBestSV(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  const db = createAdminClient()
  const { fallLat, fallLng, terminDatum, wunschterminIso, wunschterminFensterMin = 30 } = input

  // AAR-264: Wunschtermin-Fenster für Kalender-Check pro SV.
  // Wenn der Kunde z. B. 2026-04-18 10:00 möchte, sperrt jeder bestehende
  // SV-Termin im Fenster 09:30–10:30 die Verfügbarkeit (für 30min default).
  let wunschterminStart: Date | null = null
  let wunschterminEnd: Date | null = null
  let wunschterminWindowStart: string | null = null
  let wunschterminWindowEnd: string | null = null
  if (wunschterminIso) {
    const wt = new Date(wunschterminIso)
    if (!Number.isNaN(wt.getTime())) {
      wunschterminStart = wt
      wunschterminEnd = new Date(wt.getTime() + wunschterminFensterMin * 60_000)
      wunschterminWindowStart = new Date(wt.getTime() - wunschterminFensterMin * 60_000).toISOString()
      wunschterminWindowEnd = new Date(wt.getTime() + wunschterminFensterMin * 60_000).toISOString()
    }
  }

  // AAR SV-Audit-Konsolidierung: applyDispatchableFilter ist die eine Wahrheit
  // für alle Matching-Endpoints. Filter: ist_aktiv=true + portal_zugang_
  // freigeschaltet=true + gesperrt_seit IS NULL + geloescht_am IS NULL.
  // Portal-Gate ist Pflicht — ein SV ohne durchgezogene Anzahlung darf keine
  // Fälle bekommen (Basis des Geschäftsmodells).
  const baseQuery = db
    .from('sachverstaendige')
    .select(
      'id, profile_id, paket, standort_lat, standort_lng, isochrone_polygon, ' +
        'paket_umkreis_km, ' +
        'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, ' +
        'urlaub_von, urlaub_bis, ist_aktiv, gesperrt_seit, ablehnungen_30_tage, ' +
        'profiles(vorname, nachname)',
    )
  const { data: svsRaw } = await applyDispatchableFilter(baseQuery)

  if (!svsRaw) return []
  const svs = svsRaw as unknown as Array<Record<string, unknown>>

  const candidates: SvMatchCandidate[] = []

  for (const sv of svs) {
    const reasons: string[] = []

    // Urlaub-Check
    const urlaubVon = sv.urlaub_von as string | null
    const urlaubBis = sv.urlaub_bis as string | null
    if (terminDatum && urlaubVon && urlaubBis) {
      const t = new Date(terminDatum).getTime()
      if (t >= new Date(urlaubVon).getTime() && t <= new Date(urlaubBis).getTime()) {
        continue // Im Urlaub
      }
    }

    // Kontingent-Check
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    if (kontingentFrei <= 0) continue

    // Standort vorhanden?
    if (sv.standort_lat == null || sv.standort_lng == null) continue

    // Distanz-Check (Isochrone oder Radius)
    const distanzKm = haversine(Number(sv.standort_lat), Number(sv.standort_lng), fallLat, fallLng)
    const radius = Number(sv.paket_umkreis_km) || 40

    // AAR-521: Isochrone-Polygone kommen aus DB in 3 Formaten (A/B/C).
    // Vorher wurde nur Format B erkannt → Polygone in Format A/C liefen in den
    // else-Branch und Radius-Fallback wurde NICHT gezogen. Jetzt:
    // 1) parseIsochrone normalisiert auf [lng,lat][]
    // 2) Radius-Fallback greift IMMER wenn Polygon fehlt ODER Fall außerhalb ist
    const polygon = parseIsochrone(sv.isochrone_polygon)
    let imGebiet = false
    if (polygon) {
      imGebiet = pointInPolygon([fallLng, fallLat], polygon)
      if (imGebiet) reasons.push('im Einsatzgebiet (Isochrone)')
    }
    if (!imGebiet && distanzKm <= radius) {
      imGebiet = true
      reasons.push(`${Math.round(distanzKm)}km (max ${radius}, Radius-Fallback)`)
    }

    if (!imGebiet) continue

    const paket = (sv.paket as string) || 'standard'
    const paketPrio = PAKET_PRIO[paket] ?? 1
    const ablehnungen = Number(sv.ablehnungen_30_tage) || 0

    // AAR-264: Wunschtermin-Verfügbarkeit prüfen
    let verfuegbarAmWunschtermin: boolean | undefined
    let naechsterFreierSlot: string | null | undefined
    let wunschterminBonus = 0
    if (wunschterminStart && wunschterminEnd && wunschterminWindowStart && wunschterminWindowEnd) {
      const { data: konflikte } = await db
        .from('gutachter_termine')
        .select('start_zeit')
        .eq('sv_id', sv.id as string)
        .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
        .lt('start_zeit', wunschterminWindowEnd)
        .gt('end_zeit', wunschterminWindowStart)
        .limit(1)
      verfuegbarAmWunschtermin = !konflikte || konflikte.length === 0
      if (verfuegbarAmWunschtermin) {
        wunschterminBonus = 40
        reasons.push(`am Wunschtermin frei`)
      } else {
        // Nächsten freien Slot ab Wunschtermin suchen — einfacher Helper
        // inline um keine zirkuläre Action-Abhängigkeit zu bauen.
        naechsterFreierSlot = await findNextFreeSlotForSv(db, sv.id as string, wunschterminStart)
        reasons.push(`am Wunschtermin belegt`)
      }
    }

    // Score: höher = besser
    // +100 pro Paket-Stufe, -2 pro offenem Fall, -2 pro Ablehnung, -1 pro km, +40 wenn am Wunschtermin frei
    const score = paketPrio * 100 - kontingentGenutzt * 2 - ablehnungen * 2 - distanzKm + wunschterminBonus
    reasons.push(`Paket: ${paket}`)
    reasons.push(`${kontingentFrei}/${kontingentGesamt} frei`)

    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    candidates.push({
      svId: sv.id as string,
      profileId: (sv.profile_id as string) ?? null,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      paket,
      distanzKm: Math.round(distanzKm * 10) / 10,
      offeneFaelle: kontingentGenutzt,
      kontingentFrei,
      ablehnungen30d: ablehnungen,
      score,
      reasons,
      verfuegbarAmWunschtermin,
      naechsterFreierSlot,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, limit)
}

// AAR-264: Sucht den nächsten freien 2h-Slot ab einem Startzeitpunkt für einen SV.
// Werktage Mo–Fr 09:00–16:00 Start. Inline statt Action-Import um zirkuläre
// 'use server'-Abhängigkeit zu vermeiden.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findNextFreeSlotForSv(db: any, svId: string, ab: Date): Promise<string | null> {
  const slotDauerMin = 120
  const inZwoelfWochen = new Date(ab.getTime() + 12 * 7 * 24 * 60 * 60 * 1000)

  const { data: bestehend } = await db
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', ab.toISOString())
    .lte('start_zeit', inZwoelfWochen.toISOString())
    .order('start_zeit', { ascending: true })

  const kandidat = new Date(ab)
  // Bei Konflikt am exakten Wunschtermin → ab nächstem ganzen Stundenslot suchen
  kandidat.setMinutes(0, 0, 0)
  kandidat.setTime(kandidat.getTime() + 60 * 60_000)

  const maxIter = 12 * 7 * 24
  let i = 0
  while (kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const wochentag = kandidat.getDay()
    if (wochentag !== 0 && wochentag !== 6 && kandidat.getHours() >= 9 && kandidat.getHours() < 16) {
      const slotEnd = new Date(kandidat.getTime() + slotDauerMin * 60_000)
      const konflikt = ((bestehend ?? []) as { start_zeit: string; end_zeit: string }[]).some((b) =>
        new Date(b.start_zeit) < slotEnd && new Date(b.end_zeit) > kandidat,
      )
      if (!konflikt) return kandidat.toISOString()
    }
    kandidat.setTime(kandidat.getTime() + 60 * 60_000)
    if (kandidat.getHours() >= 17) {
      kandidat.setDate(kandidat.getDate() + 1)
      kandidat.setHours(9, 0, 0, 0)
    }
  }
  return null
}
