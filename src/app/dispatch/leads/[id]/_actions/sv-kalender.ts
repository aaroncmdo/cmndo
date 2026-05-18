'use server'

// SV-Kalender-Vergleich: Lädt für eine Liste von SVs alle Termine im
// Zeitraum + Mapbox-ETAs vom Besichtigungsort des Leads zu jedem Termin.
// Wird vom SvKalenderVergleichModal genutzt damit der Dispatcher am Telefon
// mit dem Kunden eine sinnvolle Slot-Empfehlung machen kann.

import { createClient } from '@/lib/supabase/server'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'

export type SvKalenderTermin = {
  id: string
  startIso: string
  endIso: string
  status: string
  typ: string | null
  /** Besichtigungsort des Termins (Adresse), wenn auflösbar */
  ortAdresse: string | null
  ortLat: number | null
  ortLng: number | null
  /** ETA vom Lead-Besichtigungsort zu diesem Termin-Ort, in Minuten */
  etaVomLeadMin: number | null
}

export type SvKalenderTab = {
  svId: string
  name: string
  /** ETA Lead-Besichtigungsort → SV-Büro */
  etaLeadZuBueroMin: number | null
  termine: SvKalenderTermin[]
}

export type SvKalenderResult = {
  ok: boolean
  error?: string
  /** Zentraler Bezugspunkt (Lead-Besichtigungsort) */
  leadAdresse: string | null
  leadLat: number | null
  leadLng: number | null
  fromIso: string
  toIso: string
  tabs: SvKalenderTab[]
}

export async function getSvKalenderVergleich(
  leadId: string,
  svIds: string[],
  rangeDays = 14,
): Promise<SvKalenderResult> {
  const supabase = await createClient()
  const empty: SvKalenderResult = {
    ok: false,
    leadAdresse: null,
    leadLat: null,
    leadLng: null,
    fromIso: '',
    toIso: '',
    tabs: [],
  }

  if (!leadId || svIds.length === 0) {
    return { ...empty, error: 'leadId oder svIds fehlen' }
  }

  // Lead-Besichtigungsort als zentraler Bezugspunkt
  const { data: lead } = await supabase
    .from('leads')
    .select('besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', leadId)
    .maybeSingle()

  const leadLat = (lead?.besichtigungsort_lat as number | null) ?? null
  const leadLng = (lead?.besichtigungsort_lng as number | null) ?? null
  const leadAdresse = (lead?.besichtigungsort_adresse as string | null) ?? null

  const now = new Date()
  const fromIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const toIso = new Date(now.getTime() + rangeDays * 24 * 3600_000).toISOString()

  // SV-Stammdaten (Name + Standort)
  const { data: svRaw } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
    .in('id', svIds)

  type SvRow = {
    id: string
    standort_lat: number | null
    standort_lng: number | null
    profile: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
  }
  const svRows = (svRaw ?? []) as unknown as SvRow[]
  const svMeta = new Map<string, { name: string; lat: number | null; lng: number | null }>()
  for (const s of svRows) {
    const p = Array.isArray(s.profile) ? s.profile[0] : s.profile
    const name = `${p?.vorname ?? ''} ${p?.nachname ?? ''}`.trim() || 'Sachverständiger'
    svMeta.set(s.id, { name, lat: s.standort_lat, lng: s.standort_lng })
  }

  // Mapbox ETAs Lead → SV-Büros (nur wenn Lead-Koordinaten da)
  const buroEtas = new Map<string, number | null>()
  if (leadLat != null && leadLng != null) {
    const buros: Array<{ svId: string; lat: number; lng: number }> = []
    for (const id of svIds) {
      const m = svMeta.get(id)
      if (m?.lat != null && m?.lng != null) buros.push({ svId: id, lat: m.lat, lng: m.lng })
    }
    if (buros.length > 0) {
      const etas = await mapboxEtaMatrix(
        { lat: leadLat, lng: leadLng },
        buros.map((b) => ({ lat: b.lat, lng: b.lng })),
      )
      buros.forEach((b, i) => buroEtas.set(b.svId, etas[i] ?? null))
    }
  }

  // Alle Termine aller SVs im Zeitraum
  const { data: termineRaw } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, typ, lead_id, fall_id')
    .in('sv_id', svIds)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .gte('end_zeit', fromIso)
    .lte('start_zeit', toIso)
    .order('start_zeit', { ascending: true })

  type TerminRow = {
    id: string
    sv_id: string
    start_zeit: string
    end_zeit: string
    status: string
    typ: string | null
    lead_id: string | null
    fall_id: string | null
  }
  const termine = (termineRaw ?? []) as TerminRow[]

  // Lead/Fall-Locations für Adress-Auflösung
  const leadIds = Array.from(new Set(termine.map((t) => t.lead_id).filter((x): x is string => !!x)))
  const fallIds = Array.from(new Set(termine.map((t) => t.fall_id).filter((x): x is string => !!x)))
  const [leadLocsRes, fallLocsRes] = await Promise.all([
    leadIds.length
      ? supabase.from('leads').select('id, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng').in('id', leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; besichtigungsort_adresse: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }> }),
    // CMM-47 D.2: faelle → v_claim_full (Alias id:fall_id; besichtigungsort_* seit Mig 5 in View).
    fallIds.length
      ? supabase.from('v_claim_full').select('id:fall_id, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng').in('fall_id', fallIds)
      : Promise.resolve({ data: [] as Array<{ id: string; besichtigungsort_adresse: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }> }),
  ])
  const leadLocMap = new Map<string, { adr: string | null; lat: number | null; lng: number | null }>()
  for (const l of (leadLocsRes.data ?? [])) {
    leadLocMap.set(l.id as string, { adr: l.besichtigungsort_adresse, lat: l.besichtigungsort_lat, lng: l.besichtigungsort_lng })
  }
  const fallLocMap = new Map<string, { adr: string | null; lat: number | null; lng: number | null }>()
  for (const f of (fallLocsRes.data ?? [])) {
    fallLocMap.set(f.id as string, { adr: f.besichtigungsort_adresse, lat: f.besichtigungsort_lat, lng: f.besichtigungsort_lng })
  }

  // Pro Termin Ort auflösen
  type Enriched = TerminRow & { adr: string | null; lat: number | null; lng: number | null }
  const enriched: Enriched[] = termine.map((t) => {
    let loc: { adr: string | null; lat: number | null; lng: number | null } | undefined
    if (t.fall_id) loc = fallLocMap.get(t.fall_id)
    if (!loc && t.lead_id) loc = leadLocMap.get(t.lead_id)
    return { ...t, adr: loc?.adr ?? null, lat: loc?.lat ?? null, lng: loc?.lng ?? null }
  })

  // Mapbox: ETAs vom Lead-Besichtigungsort zu allen Termin-Locations (eine Matrix-Call)
  const etaMap = new Map<string, number | null>()
  if (leadLat != null && leadLng != null) {
    const withCoords = enriched.filter((e) => e.lat != null && e.lng != null)
    if (withCoords.length > 0) {
      const etas = await mapboxEtaMatrix(
        { lat: leadLat, lng: leadLng },
        withCoords.map((e) => ({ lat: e.lat as number, lng: e.lng as number })),
      )
      withCoords.forEach((e, i) => etaMap.set(e.id, etas[i] ?? null))
    }
  }

  // Tabs zusammenbauen — Reihenfolge folgt svIds-Input
  const tabs: SvKalenderTab[] = svIds.map((svId) => {
    const meta = svMeta.get(svId)
    const svTermine = enriched
      .filter((t) => t.sv_id === svId)
      .map<SvKalenderTermin>((t) => ({
        id: t.id,
        startIso: t.start_zeit,
        endIso: t.end_zeit,
        status: t.status,
        typ: t.typ,
        ortAdresse: t.adr,
        ortLat: t.lat,
        ortLng: t.lng,
        etaVomLeadMin: etaMap.get(t.id) ?? null,
      }))
    return {
      svId,
      name: meta?.name ?? 'Sachverständiger',
      etaLeadZuBueroMin: buroEtas.get(svId) ?? null,
      termine: svTermine,
    }
  })

  return {
    ok: true,
    leadAdresse,
    leadLat,
    leadLng,
    fromIso,
    toIso,
    tabs,
  }
}
