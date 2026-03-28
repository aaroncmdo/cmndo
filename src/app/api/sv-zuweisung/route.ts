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

// ─── POST /api/sv-zuweisung ──────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  // Body
  const body = await request.json().catch(() => null)
  const fallId: string | undefined = body?.fall_id
  if (!fallId) {
    return NextResponse.json({ error: 'fall_id fehlt' }, { status: 400 })
  }

  // 1. Fall laden
  const { data: fall, error: fallErr } = await supabase
    .from('faelle')
    .select('id, schadens_plz, sv_id, status')
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

  // 3. Alle aktiven SVs mit Kapazität laden
  const { data: svList, error: svErr } = await supabase
    .from('sachverstaendige')
    .select('id, gebiet_plz, lat, lng, partner_seit, offene_faelle, max_faelle_monat')
    .eq('ist_aktiv', true)

  if (svErr || !svList || svList.length === 0) {
    return NextResponse.json(
      { error: 'Keine aktiven Sachverständigen gefunden' },
      { status: 404 },
    )
  }

  // 4. Filtern: Kapazität + Umkreis 40 km
  type Candidate = (typeof svList)[number] & { distanz_km: number | null }

  const candidates: Candidate[] = []

  for (const sv of svList) {
    // Kapazitätsprüfung
    if (sv.offene_faelle >= sv.max_faelle_monat) continue

    let distanz: number | null = null
    let inRange = false

    // a) Haversine-Distanz, wenn beide Koordinaten vorliegen
    if (schadenGeo && sv.lat != null && sv.lng != null) {
      distanz = haversineKm(
        Number(schadenGeo.lat), Number(schadenGeo.lng),
        Number(sv.lat), Number(sv.lng),
      )
      inRange = distanz <= 40
    }

    // b) Fallback: PLZ im gebiet_plz-Array des SV?
    if (!inRange && Array.isArray(sv.gebiet_plz)) {
      if (sv.gebiet_plz.includes(fall.schadens_plz)) {
        inRange = true
        distanz = 0 // Direkt-Match
      }
    }

    if (inRange) {
      candidates.push({ ...sv, distanz_km: distanz })
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'Kein passender SV im Umkreis von 40 km gefunden' },
      { status: 404 },
    )
  }

  // 5. Sortieren: partner_seit ASC (länger dabei = Vorrang)
  candidates.sort((a, b) => {
    const da = a.partner_seit ? new Date(a.partner_seit).getTime() : Infinity
    const db = b.partner_seit ? new Date(b.partner_seit).getTime() : Infinity
    return da - db
  })

  const bestSv = candidates[0]

  // 6. Fall updaten: SV zuweisen + Status ändern
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('faelle')
    .update({
      sv_id: bestSv.id,
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

  // 7. offene_faelle beim SV um 1 erhöhen
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
