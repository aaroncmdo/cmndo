import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Haversine (km) ──────────────────────────────────────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MatchResult = {
  empfohlen: GutachterSlot | null
  alternative_1: GutachterSlot | null
  alternative_2: GutachterSlot | null
}

type GutachterSlot = {
  sv_id: string
  name: string
  entfernung_km: number | null
  auslastung: string
  offene_faelle: number
  max_faelle_monat: number
  paket: string | null
  termin: string
  wunschtermin_moeglich: boolean
}

// 2h appointment block: 30min drive + 60min inspection + 30min buffer
const BLOCK_MINUTES = 120

// ─── POST /api/gutachter-matching ────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const plz: string | undefined = body?.plz
  const wunschtermin: string | undefined = body?.wunschtermin
  const schadenfallTyp: string | undefined = body?.schadenfall_typ

  if (!plz || !wunschtermin) {
    return NextResponse.json({ error: 'plz und wunschtermin sind erforderlich' }, { status: 400 })
  }

  // 1. PLZ geo lookup
  const { data: plzGeo } = await supabase
    .from('plz_geo')
    .select('lat, lng')
    .eq('plz', plz)
    .single()

  // 2. Load all active SVs with kalender_sync
  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select(`
      id, gebiet_plz, lat, lng, partner_seit,
      offene_faelle, max_faelle_monat, paket, qualifikationen,
      ist_aktiv, profile_id, kalender_sync_aktiv,
      paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km,
      standort_lat, standort_lng
    `)
    .eq('ist_aktiv', true)

  if (!svList || svList.length === 0) {
    return NextResponse.json({ error: 'Keine aktiven Gutachter gefunden' }, { status: 404 })
  }

  // 3. Filter by 40km radius + capacity
  type Candidate = (typeof svList)[number] & { distanz_km: number | null; score: number }
  const candidates: Candidate[] = []

  for (const sv of svList) {
    let distanz: number | null = null
    let inRange = false
    const maxRadius = sv.paket_umkreis_km ?? 40

    // Use standort_lat/lng if available, fallback to lat/lng
    const svLat = sv.standort_lat ?? sv.lat
    const svLng = sv.standort_lng ?? sv.lng

    if (plzGeo && svLat != null && svLng != null) {
      distanz = haversineKm(
        Number(plzGeo.lat), Number(plzGeo.lng),
        Number(svLat), Number(svLng),
      )
      inRange = distanz <= maxRadius
    }

    if (!inRange && Array.isArray(sv.gebiet_plz)) {
      if (sv.gebiet_plz.includes(plz)) {
        inRange = true
        distanz = 0
      }
    }

    if (!inRange) continue

    // Priority score: lower = better
    let score = 0

    // a) Capacity: prefer those with room in their package
    const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
    const genutztFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    if (genutztFaelle >= maxFaelle) score += 1000

    // b) partner_seit: earlier = better
    if (sv.partner_seit) {
      const years = (Date.now() - new Date(sv.partner_seit).getTime()) / (365.25 * 86400000)
      score -= years * 10
    }

    // c) Qualifications matching schadenfall_typ
    if (schadenfallTyp && Array.isArray(sv.qualifikationen)) {
      if (sv.qualifikationen.includes(schadenfallTyp)) {
        score -= 50
      }
    }

    // d) Distance: closer = better
    if (distanz != null) {
      score += distanz
    }

    candidates.push({ ...sv, distanz_km: distanz, score })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'Kein Gutachter im Umkreis gefunden' }, { status: 404 })
  }

  candidates.sort((a, b) => a.score - b.score)

  // 4. Load profile names for top candidates
  const topCandidates = candidates.slice(0, 10)
  const profileIds = topCandidates.map(c => c.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }

  const profileNameMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    profileNameMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
  }

  // 5. Check availability using gutachter_termine table (real calendar)
  const wunschDate = new Date(wunschtermin)
  const wunschDayStart = new Date(wunschDate)
  wunschDayStart.setHours(0, 0, 0, 0)
  const wunschDayEnd = new Date(wunschDate)
  wunschDayEnd.setHours(23, 59, 59, 999)

  const candidateIds = topCandidates.map(c => c.id)

  // Load from gutachter_termine (includes both Claimondo + synced external calendar)
  const { data: kalenderTermine } = await supabase
    .from('gutachter_termine')
    .select('sv_id, start_zeit, end_zeit, status')
    .in('sv_id', candidateIds)
    .gte('start_zeit', wunschDayStart.toISOString())
    .lte('start_zeit', wunschDayEnd.toISOString())
    .in('status', ['bestaetigt', 'vorschlag'])

  // Also check faelle.sv_termin as fallback for legacy data
  const { data: fallTermine } = await supabase
    .from('faelle')
    .select('sv_id, sv_termin')
    .in('sv_id', candidateIds)
    .gte('sv_termin', wunschDayStart.toISOString())
    .lte('sv_termin', wunschDayEnd.toISOString())

  // Check if a 2h block starting at a given time conflicts with any existing appointment
  function isBlocked(svId: string, startTime: Date): boolean {
    const blockEnd = new Date(startTime.getTime() + BLOCK_MINUTES * 60 * 1000)

    // Check gutachter_termine
    for (const t of kalenderTermine ?? []) {
      if (t.sv_id !== svId) continue
      const tStart = new Date(t.start_zeit)
      const tEnd = new Date(t.end_zeit)
      // Overlap check: block [startTime, blockEnd) overlaps [tStart, tEnd)
      if (startTime < tEnd && blockEnd > tStart) return true
    }

    // Check faelle.sv_termin (legacy, 2h assumed block)
    for (const t of fallTermine ?? []) {
      if (t.sv_id !== svId || !t.sv_termin) continue
      const tStart = new Date(t.sv_termin)
      const tEnd = new Date(tStart.getTime() + BLOCK_MINUTES * 60 * 1000)
      if (startTime < tEnd && blockEnd > tStart) return true
    }

    return false
  }

  // 6. Build recommended result
  const prioSv = topCandidates[0]
  const prioAvailable = !isBlocked(prioSv.id, wunschDate)

  function buildSlot(sv: Candidate, termin: string, wunschMoeglich: boolean): GutachterSlot {
    const maxF = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
    const genutztF = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    return {
      sv_id: sv.id,
      name: profileNameMap[sv.profile_id] ?? '—',
      entfernung_km: sv.distanz_km != null ? Math.round(sv.distanz_km) : null,
      auslastung: `${genutztF}/${maxF}`,
      offene_faelle: genutztF,
      max_faelle_monat: maxF,
      paket: sv.paket,
      termin,
      wunschtermin_moeglich: wunschMoeglich,
    }
  }

  const empfohlen = prioAvailable
    ? buildSlot(prioSv, wunschtermin, true)
    : null

  // 7. Find 2 alternative slots
  const alternatives: GutachterSlot[] = []

  // If Prio-SV not available at Wunschtermin, try other times same day
  const sameDayHours = [9, 10, 11, 13, 14, 15, 16]
  const wunschHour = wunschDate.getHours()

  // Sort alternative hours by proximity to Wunschtermin
  const sortedHours = [...sameDayHours]
    .filter(h => h !== wunschHour)
    .sort((a, b) => Math.abs(a - wunschHour) - Math.abs(b - wunschHour))

  // Try same day, different times for top candidates
  for (const hour of sortedHours) {
    if (alternatives.length >= 2) break
    const altDate = new Date(wunschDate)
    altDate.setHours(hour, 0, 0, 0)

    for (const sv of topCandidates) {
      if (alternatives.length >= 2) break
      if (!isBlocked(sv.id, altDate)) {
        const altIso = altDate.toISOString()
        if (!alternatives.some(a => a.sv_id === sv.id && a.termin === altIso)) {
          alternatives.push(buildSlot(sv, altIso, false))
          break
        }
      }
    }
  }

  // Try next days if still need alternatives
  if (alternatives.length < 2) {
    const dayOffsets = [1, 2, -1, 3]
    for (const offset of dayOffsets) {
      if (alternatives.length >= 2) break
      const altDay = new Date(wunschDate)
      altDay.setDate(altDay.getDate() + offset)
      if (altDay.getDay() === 0 || altDay.getDay() === 6) continue

      // Load termine for that day
      const dayStart = new Date(altDay)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(altDay)
      dayEnd.setHours(23, 59, 59, 999)

      const { data: altKalender } = await supabase
        .from('gutachter_termine')
        .select('sv_id, start_zeit, end_zeit, status')
        .in('sv_id', candidateIds)
        .gte('start_zeit', dayStart.toISOString())
        .lte('start_zeit', dayEnd.toISOString())
        .in('status', ['bestaetigt', 'vorschlag'])

      const { data: altFall } = await supabase
        .from('faelle')
        .select('sv_id, sv_termin')
        .in('sv_id', candidateIds)
        .gte('sv_termin', dayStart.toISOString())
        .lte('sv_termin', dayEnd.toISOString())

      function isBlockedAlt(svId: string, startTime: Date): boolean {
        const blockEnd = new Date(startTime.getTime() + BLOCK_MINUTES * 60 * 1000)
        for (const t of altKalender ?? []) {
          if (t.sv_id !== svId) continue
          const tStart = new Date(t.start_zeit)
          const tEnd = new Date(t.end_zeit)
          if (startTime < tEnd && blockEnd > tStart) return true
        }
        for (const t of altFall ?? []) {
          if (t.sv_id !== svId || !t.sv_termin) continue
          const tStart = new Date(t.sv_termin)
          const tEnd = new Date(tStart.getTime() + BLOCK_MINUTES * 60 * 1000)
          if (startTime < tEnd && blockEnd > tStart) return true
        }
        return false
      }

      const altDate = new Date(altDay)
      altDate.setHours(wunschHour, 0, 0, 0)

      for (const sv of topCandidates) {
        if (alternatives.length >= 2) break
        if (!isBlockedAlt(sv.id, altDate)) {
          const altIso = altDate.toISOString()
          if (!alternatives.some(a => a.termin === altIso && a.sv_id === sv.id)) {
            alternatives.push(buildSlot(sv, altIso, false))
            break
          }
        }
      }
    }
  }

  const result: MatchResult = {
    empfohlen,
    alternative_1: alternatives[0] ?? null,
    alternative_2: alternatives[1] ?? null,
  }

  return NextResponse.json(result)
}
