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

// Fahrzeit in Minuten schätzen (50 km/h Durchschnitt Stadtverkehr)
function fahrzeitMin(distanzKm: number): number {
  return Math.round(distanzKm * 1.2) // 50 km/h = 1.2 min/km
}

// ─── Types ───────────────────────────────────────────────────────────────────

const BESICHTIGUNG_MIN = 60 // Besichtigung = IMMER 60 Minuten

type GutachterSlot = {
  sv_id: string
  name: string
  prio: number
  partner_seit: string | null
  entfernung_km: number | null
  fahrzeit_min: number | null
  auslastung: string
  offene_faelle: number
  max_faelle_monat: number
  paket: string | null
  termin: string
  wunschtermin_moeglich: boolean
  naechster_freier_slot: string | null
  route_info: string | null
}

// Backward-compatible response
type MatchResult = {
  empfohlen: GutachterSlot | null
  alternative_1: GutachterSlot | null
  alternative_2: GutachterSlot | null
  alle_kandidaten: GutachterSlot[]
  sv_gesucht: boolean
}

// ─── POST /api/gutachter-matching ────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const plz: string | undefined = body?.plz
  const wunschtermin: string | undefined = body?.wunschtermin
  const schadenfallTyp: string | undefined = body?.schadenfall_typ
  const directLat: number | undefined = body?.lat
  const directLng: number | undefined = body?.lng

  if (!plz || !wunschtermin) {
    return NextResponse.json({ error: 'plz und wunschtermin sind erforderlich' }, { status: 400 })
  }

  // 1. Koordinaten
  let plzGeo: { lat: number; lng: number } | null = null
  if (directLat != null && directLng != null) {
    plzGeo = { lat: directLat, lng: directLng }
  } else {
    const { data } = await supabase.from('plz_geo').select('lat, lng').eq('plz', plz).single()
    plzGeo = data
  }

  // 2. Alle aktiven SVs laden
  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select('id, partner_seit, offene_faelle, max_faelle_monat, paket, qualifikationen, ist_aktiv, profile_id, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_lat, standort_lng, isochrone_polygon')
    .eq('ist_aktiv', true)

  if (!svList?.length) return NextResponse.json({ error: 'Keine aktiven Gutachter gefunden' }, { status: 404 })

  // 3. Filter nach Gebiet + Kapazität + Scoring
  type Candidate = (typeof svList)[number] & { distanz_km: number | null; score: number }
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
        if (distanz === null && svLat != null && svLng != null) {
          distanz = haversineKm(Number(plzGeo.lat), Number(plzGeo.lng), Number(svLat), Number(svLng))
        }
      }
    }

    if (!inRange) continue

    const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
    const genutztFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    if (genutztFaelle >= maxFaelle) continue

    // Prio-Scoring (lower = better)
    let score = 0
    if (sv.partner_seit) {
      const years = (Date.now() - new Date(sv.partner_seit).getTime()) / (365.25 * 86400000)
      score -= Math.min(years, 10) * 10
    }
    const kapFrei = maxFaelle > 0 ? 1 - (genutztFaelle / maxFaelle) : 0.5
    score -= kapFrei * 30
    if (schadenfallTyp && Array.isArray(sv.qualifikationen) && sv.qualifikationen.includes(schadenfallTyp)) score -= 50
    if (distanz != null) score += distanz

    candidates.push({ ...sv, distanz_km: distanz, score })
  }

  if (!candidates.length) {
    return NextResponse.json({ empfohlen: null, alternative_1: null, alternative_2: null, alle_kandidaten: [], sv_gesucht: true })
  }

  candidates.sort((a, b) => a.score - b.score)

  // 4. Profile-Namen laden
  const topCandidates = candidates.slice(0, 10)
  const profileIds = topCandidates.map(c => c.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }
  const nameMap: Record<string, string> = {}
  for (const p of profiles ?? []) nameMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'

  // 5. Termine des Tages laden für alle Kandidaten
  const wDate = new Date(wunschtermin)
  const dayStart = new Date(wDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(wDate); dayEnd.setHours(23, 59, 59, 999)
  const svIds = topCandidates.map(c => c.id)

  const [{ data: kalTermine }, { data: fallTermine }] = await Promise.all([
    supabase.from('gutachter_termine').select('sv_id, start_zeit, end_zeit, status')
      .in('sv_id', svIds).gte('start_zeit', dayStart.toISOString()).lte('start_zeit', dayEnd.toISOString())
      .in('status', ['bestaetigt', 'reserviert', 'vorschlag']),
    supabase.from('faelle').select('sv_id, sv_termin, schadens_adresse')
      .in('sv_id', svIds).not('sv_termin', 'is', null)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .gte('sv_termin', dayStart.toISOString()).lte('sv_termin', dayEnd.toISOString()),
  ])

  console.log(`[matching] ${topCandidates.length} Kandidaten, Tag: ${dayStart.toISOString()}, kalTermine: ${kalTermine?.length ?? 0}, fallTermine: ${fallTermine?.length ?? 0}`)

  // Termine pro SV gruppieren
  function getTermine(svId: string): { start: Date; end: Date; adresse: string }[] {
    const termine: { start: Date; end: Date; adresse: string }[] = []
    for (const t of kalTermine ?? []) {
      if (t.sv_id !== svId) continue
      termine.push({ start: new Date(t.start_zeit), end: new Date(t.end_zeit), adresse: '' })
    }
    for (const f of fallTermine ?? []) {
      if (f.sv_id !== svId || !f.sv_termin) continue
      const s = new Date(f.sv_termin)
      // Nur hinzufügen wenn nicht schon in kalTermine
      if (!termine.some(t => Math.abs(t.start.getTime() - s.getTime()) < 60000)) {
        termine.push({ start: s, end: new Date(s.getTime() + (BESICHTIGUNG_MIN + 30) * 60000), adresse: f.schadens_adresse ?? '' })
      }
    }
    termine.sort((a, b) => a.start.getTime() - b.start.getTime())
    return termine
  }

  // Verfügbarkeits-Check gemäß Prompt-Logik:
  // Vorheriger Termin endet + Fahrzeit <= gewünschter Start
  // Gewünschter Start + 60min Besichtigung + Fahrzeit <= nächster Termin
  function canDoSlot(svId: string, slotStart: Date, fahrzeit: number): boolean {
    const termine = getTermine(svId)
    const slotEnd = new Date(slotStart.getTime() + BESICHTIGUNG_MIN * 60000)

    // Kein Termin am Tag → SV ist FREI
    if (termine.length === 0) return true

    // Prüfe Überschneidung mit JEDEM existierenden Termin
    for (const t of termine) {
      // Einfacher Overlap-Check: Slot [start, start+60min] vs Termin [t.start, t.end]
      if (slotStart < t.end && slotEnd > t.start) {
        console.log(`[matching] ${svId.slice(0,8)} BLOCKED: Slot ${slotStart.toISOString()} overlaps ${t.start.toISOString()}-${t.end.toISOString()}`)
        return false
      }
    }

    // Prüfe ob Fahrzeit vom vorherigen Termin passt
    const vorher = termine.filter(t => t.end <= slotStart)
    if (vorher.length > 0) {
      const letzter = vorher[vorher.length - 1]
      const fruehestAnkunft = new Date(letzter.end.getTime() + fahrzeit * 60000)
      if (fruehestAnkunft > slotStart) {
        console.log(`[matching] ${svId.slice(0,8)} BLOCKED by travel: prev ends ${letzter.end.toISOString()}, +${fahrzeit}min → ${fruehestAnkunft.toISOString()} > ${slotStart.toISOString()}`)
        return false
      }
    }

    // Prüfe ob Fahrzeit zum nächsten Termin passt
    const nachher = termine.filter(t => t.start >= slotEnd)
    if (nachher.length > 0) {
      const naechster = nachher[0]
      const spaetesteAbfahrt = new Date(naechster.start.getTime() - fahrzeit * 60000)
      if (slotEnd > spaetesteAbfahrt) {
        console.log(`[matching] ${svId.slice(0,8)} BLOCKED by next: slot ends ${slotEnd.toISOString()}, next at ${naechster.start.toISOString()}, need ${fahrzeit}min travel`)
        return false
      }
    }

    console.log(`[matching] ${svId.slice(0,8)} AVAILABLE at ${slotStart.toISOString()} (${termine.length} existing termine)`)
    return true
  }

  // Nächsten freien Slot finden (gleicher Tag, 8-17 Uhr)
  function findNextFreeSlot(svId: string, fahrzeit: number): Date | null {
    for (let h = 8; h <= 17; h++) {
      for (const m of [0, 30]) {
        const slot = new Date(wDate)
        slot.setHours(h, m, 0, 0)
        if (slot.getTime() <= Date.now()) continue
        if (canDoSlot(svId, slot, fahrzeit)) return slot
      }
    }
    return null
  }

  // Route-Info: letzter Termin VOR dem Wunschtermin
  function getRouteInfo(svId: string, distKm: number | null): { info: string; fahrzeit: number } {
    const termine = getTermine(svId)
    const vorher = termine.filter(t => t.end <= wDate)
    if (vorher.length > 0) {
      const letzter = vorher[vorher.length - 1]
      const endZeit = `${String(letzter.end.getHours()).padStart(2, '0')}:${String(letzter.end.getMinutes()).padStart(2, '0')}`
      const fz = distKm != null ? fahrzeitMin(distKm) : 30
      return { info: `Letzter Termin endet ${endZeit} + ~${fz}min Fahrt`, fahrzeit: fz }
    }
    const fz = distKm != null ? fahrzeitMin(distKm) : 20
    return { info: `Anfahrt vom Büro ~${fz}min`, fahrzeit: fz }
  }

  // 6. Slots bauen — Prio 1 IMMER zeigen
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

  const result: MatchResult = {
    empfohlen: slots[0] ?? null,
    alternative_1: slots[1] ?? null,
    alternative_2: slots[2] ?? null,
    alle_kandidaten: slots,
    sv_gesucht: svGesucht,
  }

  return NextResponse.json(result)
}
