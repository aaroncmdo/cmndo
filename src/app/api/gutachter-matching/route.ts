import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Haversine (km) ──────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if ((yi > point.lng) !== (yj > point.lng) && point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function fahrzeitMin(distanzKm: number): number {
  return Math.round(distanzKm * 1.2) // ~50 km/h
}

function fmtTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

const BESICHTIGUNG_MIN = 60

type GutachterSlot = {
  sv_id: string; name: string; prio: number; partner_seit: string | null
  entfernung_km: number | null; fahrzeit_min: number | null
  auslastung: string; offene_faelle: number; max_faelle_monat: number; paket: string | null
  termin: string; wunschtermin_moeglich: boolean
  naechster_freier_slot: string | null; route_info: string | null
}

type MatchResult = {
  empfohlen: GutachterSlot | null
  alternative_1: GutachterSlot | null
  alternative_2: GutachterSlot | null
  alle_kandidaten: GutachterSlot[]
  sv_gesucht: boolean
}

type Termin = { start: Date; end: Date }

// ─── POST /api/gutachter-matching ────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const plz: string | undefined = body?.plz
  const wunschtermin: string | undefined = body?.wunschtermin
  const schadenfallTyp: string | undefined = body?.schadenfall_typ
  // KFZ-154: zusaetzlich Spezifikation (Hard-Filter mit Fallback) und
  // Schadenart (Soft-Score Bonus) per Body-Param.
  const spezifikation: string | undefined = body?.spezifikation
  const schadenart: string | undefined = body?.schadenart
  const directLat: number | undefined = body?.lat
  const directLng: number | undefined = body?.lng

  if (!plz || !wunschtermin) {
    return NextResponse.json({ error: 'plz und wunschtermin sind erforderlich' }, { status: 400 })
  }

  const wDate = new Date(wunschtermin)
  console.log(`[matching] Wunschtermin: ${wDate.toISOString()} (UTC ${fmtTime(wDate)})`)

  // 1. Koordinaten
  let plzGeo: { lat: number; lng: number } | null = null
  if (directLat != null && directLng != null) {
    plzGeo = { lat: directLat, lng: directLng }
  } else {
    const { data } = await supabase.from('plz_geo').select('lat, lng').eq('plz', plz).single()
    plzGeo = data
  }

  // 2. Alle aktiven SVs
  // KFZ-154 Cleanup: legacy qualifikationen Spalte gedroppt
  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select('id, partner_seit, offene_faelle, max_faelle_monat, paket, qualifikationen_neu, spezifikationen, schadenarten, ist_aktiv, profile_id, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_lat, standort_lng, isochrone_polygon')
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true) // KFZ-148: Nur freigeschaltete SVs

  if (!svList?.length) return NextResponse.json({ empfohlen: null, alternative_1: null, alternative_2: null, alle_kandidaten: [], sv_gesucht: true })

  // 3. Filter + Scoring
  // KFZ-154: spez_match Flag (Hard-Filter mit Fallback unten), schaden_match Bonus
  type Candidate = (typeof svList)[number] & { distanz_km: number | null; score: number; spez_match: boolean; schaden_match: boolean }
  const candidates: Candidate[] = []

  for (const sv of svList) {
    let distanz: number | null = null
    let inRange = false
    const maxRadius = sv.paket_umkreis_km ?? 40
    const svLat = sv.standort_lat ?? null
    const svLng = sv.standort_lng ?? null

    if (plzGeo && svLat != null && svLng != null) {
      distanz = haversineKm(Number(plzGeo.lat), Number(plzGeo.lng), Number(svLat), Number(svLng))
      inRange = distanz <= maxRadius
    }
    if (!inRange && plzGeo && sv.isochrone_polygon && Array.isArray(sv.isochrone_polygon)) {
      if (pointInPolygon({ lat: Number(plzGeo.lat), lng: Number(plzGeo.lng) }, sv.isochrone_polygon as { lat: number; lng: number }[])) {
        inRange = true
        if (distanz === null && svLat != null && svLng != null) distanz = haversineKm(Number(plzGeo.lat), Number(plzGeo.lng), Number(svLat), Number(svLng))
      }
    }
    if (!inRange) continue

    const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
    const genutztFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    if (genutztFaelle >= maxFaelle) continue

    // KFZ-154: Spezialisierungs-Match-Flags
    const svSpez = (sv.spezifikationen as string[] | null) ?? []
    const svSchaden = (sv.schadenarten as string[] | null) ?? []
    const svQualNeu = (sv.qualifikationen_neu as string[] | null) ?? []
    const spezMatch = !spezifikation || svSpez.includes(spezifikation)
    const schadenMatch = !!schadenart && svSchaden.includes(schadenart)

    let score = 0
    if (sv.partner_seit) score -= Math.min((Date.now() - new Date(sv.partner_seit).getTime()) / (365.25 * 86400000), 10) * 10
    score -= (maxFaelle > 0 ? 1 - (genutztFaelle / maxFaelle) : 0.5) * 30
    // KFZ-154: schadenfall_typ-Match gegen qualifikationen_neu
    if (schadenfallTyp && svQualNeu.includes(schadenfallTyp)) score -= 50
    // KFZ-154: schadenart-Match Bonus (Soft-Priority -40)
    if (schadenMatch) score -= 40
    if (distanz != null) score += distanz

    candidates.push({ ...sv, distanz_km: distanz, score, spez_match: spezMatch, schaden_match: schadenMatch })
  }

  if (!candidates.length) {
    return NextResponse.json({ empfohlen: null, alternative_1: null, alternative_2: null, alle_kandidaten: [], sv_gesucht: true })
  }

  // KFZ-154: Hard-Filter Spezifikation mit Fallback. Wenn passender Spez-Match
  // existiert: NUR diese verwenden. Sonst Fallback auf alle Kandidaten + Warning.
  let workingCandidates = candidates
  if (spezifikation) {
    const withSpez = candidates.filter(c => c.spez_match)
    if (withSpez.length > 0) {
      workingCandidates = withSpez
    } else {
      console.warn(`[KFZ-154] gutachter-matching plz=${plz} spezifikation='${spezifikation}' kein passender SV — Fallback auf ${candidates.length} ohne Spez-Match`)
    }
  }

  workingCandidates.sort((a, b) => a.score - b.score)
  console.log(`[matching] ${workingCandidates.length}/${candidates.length} Kandidaten im Gebiet (KFZ-154 spez_filter=${!!spezifikation})`)

  // 4. Profile-Namen — KFZ-154: aus dem ggf. spez-gefilterten workingCandidates
  const topCandidates = workingCandidates.slice(0, 10)
  const profileIds = topCandidates.map(c => c.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }
  const nameMap: Record<string, string> = {}
  for (const p of profiles ?? []) nameMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'

  // 5. Termine des Tages laden
  // Lade 24h Fenster um den Wunschtag (UTC-basiert)
  const dayStart = new Date(wDate)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(wDate)
  dayEnd.setUTCHours(23, 59, 59, 999)
  const svIds = topCandidates.map(c => c.id)

  const [{ data: kalTermine }, { data: fallTermine }] = await Promise.all([
    supabase.from('gutachter_termine').select('sv_id, start_zeit, end_zeit, status')
      .in('sv_id', svIds)
      .gte('start_zeit', dayStart.toISOString())
      .lte('start_zeit', dayEnd.toISOString())
      .not('status', 'eq', 'storniert')
      .not('status', 'eq', 'abgelehnt'),
    supabase.from('faelle').select('sv_id, sv_termin')
      .in('sv_id', svIds)
      .not('sv_termin', 'is', null)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .gte('sv_termin', dayStart.toISOString())
      .lte('sv_termin', dayEnd.toISOString()),
  ])

  console.log(`[matching] DB: kalTermine=${kalTermine?.length ?? 0}, fallTermine=${fallTermine?.length ?? 0}, dayRange=${dayStart.toISOString()} bis ${dayEnd.toISOString()}`)

  // Termine pro SV bauen
  function getTermine(svId: string): Termin[] {
    const result: Termin[] = []
    const seen = new Set<string>()

    // Aus gutachter_termine (hat start + end)
    for (const t of kalTermine ?? []) {
      if (t.sv_id !== svId) continue
      const key = `${t.start_zeit}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ start: new Date(t.start_zeit), end: new Date(t.end_zeit) })
    }

    // Aus faelle.sv_termin (nur start, end = start + 90min)
    for (const f of fallTermine ?? []) {
      if (f.sv_id !== svId || !f.sv_termin) continue
      const s = new Date(f.sv_termin)
      const key = s.toISOString()
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ start: s, end: new Date(s.getTime() + 90 * 60000) })
    }

    result.sort((a, b) => a.start.getTime() - b.start.getTime())
    return result
  }

  // Verfügbarkeits-Check: Passt ein 60min-Slot OHNE Überschneidung?
  function canDoSlot(svId: string, slotStart: Date, fahrzeit: number): boolean {
    const termine = getTermine(svId)
    const slotEnd = new Date(slotStart.getTime() + BESICHTIGUNG_MIN * 60000)
    const svName = nameMap[topCandidates.find(c => c.id === svId)?.profile_id ?? ''] ?? svId.slice(0, 8)

    // Kein Termin am Tag → FREI
    if (termine.length === 0) {
      console.log(`[matching] ✅ ${svName}: FREI (keine Termine)`)
      return true
    }

    // Überschneidungs-Check mit JEDEM Termin
    for (const t of termine) {
      const overlap = slotStart.getTime() < t.end.getTime() && slotEnd.getTime() > t.start.getTime()
      if (overlap) {
        console.log(`[matching] ❌ ${svName}: BLOCKED — Slot ${fmtTime(slotStart)}-${fmtTime(slotEnd)} überschneidet ${fmtTime(t.start)}-${fmtTime(t.end)}`)
        return false
      }
    }

    // Fahrzeit vom vorherigen Termin
    const vorher = termine.filter(t => t.end.getTime() <= slotStart.getTime())
    if (vorher.length > 0) {
      const prev = vorher[vorher.length - 1]
      const ankunft = new Date(prev.end.getTime() + fahrzeit * 60000)
      if (ankunft.getTime() > slotStart.getTime()) {
        console.log(`[matching] ❌ ${svName}: BLOCKED by travel — prev endet ${fmtTime(prev.end)}, +${fahrzeit}min=${fmtTime(ankunft)} > ${fmtTime(slotStart)}`)
        return false
      }
    }

    // Fahrzeit zum nächsten Termin
    const nachher = termine.filter(t => t.start.getTime() >= slotEnd.getTime())
    if (nachher.length > 0) {
      const next = nachher[0]
      const deadline = new Date(next.start.getTime() - fahrzeit * 60000)
      if (slotEnd.getTime() > deadline.getTime()) {
        console.log(`[matching] ❌ ${svName}: BLOCKED by next — slot endet ${fmtTime(slotEnd)}, next um ${fmtTime(next.start)}, deadline ${fmtTime(deadline)}`)
        return false
      }
    }

    console.log(`[matching] ✅ ${svName}: VERFÜGBAR um ${fmtTime(slotStart)} (${termine.length} Termine heute)`)
    return true
  }

  // Nächster freier Slot (8:00-17:00 UTC, 30min-Schritte)
  function findNextFreeSlot(svId: string, fahrzeit: number): Date | null {
    for (let h = 6; h <= 18; h++) {
      for (const m of [0, 30]) {
        const slot = new Date(dayStart)
        slot.setUTCHours(h, m, 0, 0)
        if (slot.getTime() <= Date.now()) continue
        if (canDoSlot(svId, slot, fahrzeit)) return slot
      }
    }
    return null
  }

  // Route-Info
  function getRouteInfo(svId: string, distKm: number | null): { info: string; fahrzeit: number } {
    const termine = getTermine(svId)
    const vorher = termine.filter(t => t.end.getTime() <= wDate.getTime())
    if (vorher.length > 0) {
      const last = vorher[vorher.length - 1]
      const fz = distKm != null ? fahrzeitMin(distKm) : 30
      return { info: `Letzter Termin endet ${fmtTime(last.end)} + ~${fz}min Fahrt`, fahrzeit: fz }
    }
    const fz = distKm != null ? fahrzeitMin(distKm) : 20
    return { info: `Anfahrt vom Büro ~${fz}min`, fahrzeit: fz }
  }

  // 6. Slots bauen
  const slots: GutachterSlot[] = []

  for (let i = 0; i < topCandidates.length && slots.length < 5; i++) {
    const sv = topCandidates[i]
    const maxF = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
    const genutztF = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    const { info, fahrzeit } = getRouteInfo(sv.id, sv.distanz_km)
    const wunschMoeglich = canDoSlot(sv.id, wDate, fahrzeit)
    const nextSlot = wunschMoeglich ? null : findNextFreeSlot(sv.id, fahrzeit)

    slots.push({
      sv_id: sv.id,
      name: nameMap[sv.profile_id] ?? '—',
      prio: i + 1,
      partner_seit: sv.partner_seit,
      entfernung_km: sv.distanz_km != null ? Math.round(sv.distanz_km) : null,
      fahrzeit_min: fahrzeit,
      auslastung: `${genutztF}/${maxF}`,
      offene_faelle: genutztF,
      max_faelle_monat: maxF,
      paket: sv.paket,
      termin: wunschMoeglich ? wunschtermin : (nextSlot?.toISOString() ?? wunschtermin),
      wunschtermin_moeglich: wunschMoeglich,
      naechster_freier_slot: nextSlot?.toISOString() ?? null,
      route_info: info,
    })
  }

  const svGesucht = slots.length === 0 || slots.every(s => !s.wunschtermin_moeglich && !s.naechster_freier_slot)

  console.log(`[matching] Ergebnis: ${slots.length} Slots, sv_gesucht=${svGesucht}, verfügbar=${slots.filter(s => s.wunschtermin_moeglich).length}`)

  return NextResponse.json({
    empfohlen: slots[0] ?? null,
    alternative_1: slots[1] ?? null,
    alternative_2: slots[2] ?? null,
    alle_kandidaten: slots,
    sv_gesucht: svGesucht,
  })
}
