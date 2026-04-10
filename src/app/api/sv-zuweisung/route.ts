import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { emailSvZugewiesen } from '@/lib/email'

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

// ─── Point-in-Polygon (Ray Casting) ─────────────────────────────────────────

function pointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if ((yi > point.lng) !== (yj > point.lng) &&
        point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ─── POST /api/sv-zuweisung ──────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()

  // Auth
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  // Body
  const body = await request.json().catch(() => null)
  const fallId: string | undefined = body?.fall_id
  if (!fallId) {
    return NextResponse.json({ error: 'fall_id fehlt' }, { status: 400 })
  }

  // 1. Fall laden — KFZ-154: zusaetzlich spezifikation + schadenart fuer Match
  const { data: fall, error: fallErr } = await supabase
    .from('faelle')
    .select('id, schadens_plz, sv_id, status, spezifikation, schadenart')
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) {
    return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })
  }
  if (fall.sv_id) {
    return NextResponse.json({ error: 'Bereits ein SV zugewiesen' }, { status: 409 })
  }
  if (!fall.schadens_plz) {
    return NextResponse.json({ error: 'Keine Schadens-PLZ hinterlegt' }, { status: 422 })
  }

  // 2. PLZ-Koordinaten des Schadens laden
  const { data: schadenGeo } = await supabase
    .from('plz_geo')
    .select('lat, lng')
    .eq('plz', fall.schadens_plz)
    .single()

  // KFZ-152 Phase 3: Exklusivitaets-Check VOR der SV-Auswahl. Wenn der Lead
  // in einem exklusiven Community-Gebiet liegt, duerfen nur SVs aus DIESER Org
  // den Lead bekommen.
  let exklusivOrgId: string | null = null
  if (schadenGeo) {
    try {
      const { checkExklusivitaet } = await import('@/lib/dispatch/exklusivitaet')
      const ex = await checkExklusivitaet(supabase, Number(schadenGeo.lat), Number(schadenGeo.lng))
      if (ex.exklusiv) {
        exklusivOrgId = ex.organisation_id
        console.log(`[KFZ-152] Lead ${fallId} im exklusiven Gebiet von Community ${ex.community_name} (org=${ex.organisation_id})`)
      }
    } catch (err) {
      console.error('[KFZ-152] Exklusivitaets-Check fehlgeschlagen:', err)
    }
  }

  // 3. Alle aktiven SVs mit Kapazität laden
  // KFZ-154: zusaetzlich spezifikationen + schadenarten fuer den Match
  // KFZ-152 Phase 3: zusaetzlich organisation_id + rolle_in_organisation fuer Org-Routing
  let svQuery = supabase
    .from('sachverstaendige')
    .select('id, lat, lng, partner_seit, offene_faelle, max_faelle_monat, standort_lat, standort_lng, isochrone_polygon, paket_umkreis_km, spezifikationen, schadenarten, organisation_id, rolle_in_organisation')
    .eq('ist_aktiv', true)

  // Wenn Exklusivitaet aktiv: Hard-Filter auf nur die Mitglieder dieser Org
  if (exklusivOrgId) {
    svQuery = svQuery.eq('organisation_id', exklusivOrgId)
  }

  const { data: svList, error: svErr } = await svQuery

  if (svErr || !svList || svList.length === 0) {
    return NextResponse.json(
      { error: 'Keine aktiven Sachverständigen gefunden' },
      { status: 404 },
    )
  }

  // 4. Filtern: Kapazität + Umkreis 40 km
  // KFZ-154: spezifikation als Hard-Filter mit Fallback, schadenart als Soft-Priority
  type Candidate = (typeof svList)[number] & { distanz_km: number | null; spez_match: boolean; schaden_match: boolean }

  const candidates: Candidate[] = []

  for (const sv of svList) {
    // Kapazitätsprüfung
    if (sv.offene_faelle >= sv.max_faelle_monat) continue

    let distanz: number | null = null
    let inRange = false

    const svLat = sv.standort_lat ?? sv.lat
    const svLng = sv.standort_lng ?? sv.lng
    const maxRadius = sv.paket_umkreis_km ?? 40

    // a) Haversine-Distanz
    if (schadenGeo && svLat != null && svLng != null) {
      distanz = haversineKm(
        Number(schadenGeo.lat), Number(schadenGeo.lng),
        Number(svLat), Number(svLng),
      )
      inRange = distanz <= maxRadius
    }

    // b) Isochrone Point-in-Polygon (ersetzt PLZ-Matching)
    if (!inRange && schadenGeo && sv.isochrone_polygon && Array.isArray(sv.isochrone_polygon)) {
      if (pointInPolygon({ lat: Number(schadenGeo.lat), lng: Number(schadenGeo.lng) }, sv.isochrone_polygon as { lat: number; lng: number }[])) {
        inRange = true
        if (distanz === null && svLat != null && svLng != null) {
          distanz = haversineKm(Number(schadenGeo.lat), Number(schadenGeo.lng), Number(svLat), Number(svLng))
        }
      }
    }

    if (inRange) {
      // KFZ-154 Match-Flags pro Kandidat
      const svSpez = (sv.spezifikationen as string[] | null) ?? []
      const svSchaden = (sv.schadenarten as string[] | null) ?? []
      const spezMatch = !fall.spezifikation || svSpez.includes(fall.spezifikation)
      const schadenMatch = !!fall.schadenart && svSchaden.includes(fall.schadenart)
      candidates.push({ ...sv, distanz_km: distanz, spez_match: spezMatch, schaden_match: schadenMatch })
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'Kein passender SV im Umkreis von 40 km gefunden' },
      { status: 404 },
    )
  }

  // KFZ-154: Hard-Filter Spezifikation mit Fallback. Wenn der Fall eine
  // Spezifikation gesetzt hat und es Kandidaten mit Spez-Match gibt, NUR die
  // verwenden. Sonst (kein Match) Fallback auf alle (besser einer als keiner)
  // mit Warning-Log.
  let matchedCandidates = candidates
  if (fall.spezifikation) {
    const withSpez = candidates.filter(c => c.spez_match)
    if (withSpez.length > 0) {
      matchedCandidates = withSpez
    } else {
      console.warn(`[KFZ-154] sv-zuweisung fall=${fallId} spezifikation='${fall.spezifikation}' kein passender SV — Fallback auf ${candidates.length} ohne Spez-Match`)
    }
  }

  // 5. Sortieren: schadenart-Match (true vor false), dann partner_seit ASC
  matchedCandidates.sort((a, b) => {
    if (a.schaden_match !== b.schaden_match) return a.schaden_match ? -1 : 1
    const da = a.partner_seit ? new Date(a.partner_seit).getTime() : Infinity
    const db = b.partner_seit ? new Date(b.partner_seit).getTime() : Infinity
    return da - db
  })

  const bestSv = matchedCandidates[0]

  // KFZ-152 Phase 2+3: Organisations-aware Routing
  // - akademie_sub: NICHT direkt an den Sub-SV zuweisen, sondern an die
  //   Akademie-Org. Akademie-Verwalter verteilt intern manuell.
  //   sv_id bleibt null, organisation_id wird gesetzt.
  // - community_member: Lead geht in den Community-Pool. sv_id null,
  //   organisation_id gesetzt. Admin/Verwalter verteilt manuell (MVP).
  // - mitarbeiter (Buero): direkt an den Sub-Buero (existing).
  // - solo / kein org: direkt zugewiesen (existing).
  const bestRolle = (bestSv.rolle_in_organisation ?? '').toLowerCase()
  const orgPool = bestRolle === 'akademie_sub' || bestRolle === 'community_member'

  // 6. Fall updaten: SV zuweisen ODER an Org-Pool
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('faelle')
    .update(orgPool ? {
      organisation_id: bestSv.organisation_id,
      sv_zugewiesen_am: null,
      status: 'sv-gesucht',
    } : {
      sv_id: bestSv.id,
      organisation_id: bestSv.organisation_id ?? null,
      sv_zugewiesen_am: now,
      status: 'sv-zugewiesen',
    })
    .eq('id', fallId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Zuweisung fehlgeschlagen: ${updateErr.message}` },
      { status: 500 },
    )
  }

  // 7. offene_faelle beim SV um 1 erhöhen — NICHT bei org-pool routing
  if (!orgPool) {
    const { error: svUpdateErr } = await supabase.rpc('increment_offene_faelle', {
      sv_id_param: bestSv.id,
    })

    // Fallback: direktes Update wenn RPC nicht existiert
    if (svUpdateErr) {
      await supabase
        .from('sachverstaendige')
        .update({ offene_faelle: (bestSv.offene_faelle ?? 0) + 1 })
        .eq('id', bestSv.id)
    }
  }

  // 8. SV-Profil laden für Response
  const { data: svProfile } = await supabase
    .from('sachverstaendige')
    .select('id, paket, profiles(vorname, nachname, telefon, email)')
    .eq('id', bestSv.id)
    .single()

  // 9. E-Mail an SV senden (fire & forget)
  if (svProfile) {
    const p = Array.isArray(svProfile.profiles) ? svProfile.profiles[0] : svProfile.profiles
    const svEmail = (p as { email?: string })?.email
    if (svEmail) {
      let kundenName = '—'
      if (fall.schadens_plz) {
        // Schadens-PLZ reicht als Adresse, Lead-Name holen
      }
      const { data: leadForEmail } = await supabase
        .from('faelle')
        .select('lead_id')
        .eq('id', fallId)
        .single()
      if (leadForEmail?.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('vorname, nachname')
          .eq('id', leadForEmail.lead_id)
          .single()
        if (lead) kundenName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      }
      const fallData = await supabase.from('faelle').select('fall_nummer, schadens_adresse, schadens_plz, schadens_ort').eq('id', fallId).single()
      const fallNr = fallData.data?.fall_nummer ?? fallId.slice(0, 8)
      const adresse = [fallData.data?.schadens_adresse, fallData.data?.schadens_plz, fallData.data?.schadens_ort].filter(Boolean).join(', ') || '—'
      emailSvZugewiesen(svEmail, fallNr, kundenName, adresse).catch(() => {})
    }
  }

  return NextResponse.json({
    success: true,
    sv_id: bestSv.id,
    distanz_km: bestSv.distanz_km != null ? Math.round(bestSv.distanz_km) : null,
    sv: svProfile,
  })
}
