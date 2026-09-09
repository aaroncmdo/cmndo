'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { alleSeiten } from '@/lib/db/alle-seiten'
import { umkreisBox } from '@/lib/geo/umkreis-box'

/**
 * Suchradius fuer Tier-3-Leads. Die DB-Box wird DARAUS abgeleitet, damit
 * Filter und Vorfilter nie auseinanderlaufen koennen.
 */
const LEAD_RADIUS_KM = 30

type SvKandidat = {
  id: string
  firmenname: string | null
  standort_lat: number
  standort_lng: number
  isochrone_polygon: unknown
}

type SvLeadKandidat = {
  id: string
  name: string
  vorname: string | null
  lat: number
  lng: number
}

export type SvMatchResult =
  | { ok: true; typ: 'sv'; svId: string; svLeadId: null; svName: string; distanzKm: number }
  | { ok: true; typ: 'lead'; svId: null; svLeadId: string; svName: string; distanzKm: number }
  | { ok: false; error: string }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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

export async function matcheSvFuerWizard(lat: number, lng: number): Promise<SvMatchResult> {
  const supabase = createAdminClient()

  // ── Priorität 1: registrierte SVs mit echtem Kalender ──
  const { data: svData } = await supabase
    .from('sachverstaendige')
    .select('id, firmenname, standort_lat, standort_lng, isochrone_polygon')
    .eq('ist_aktiv', true)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  const svKandidaten: (SvKandidat & { distanzKm: number })[] = []

  for (const sv of (svData ?? []) as SvKandidat[]) {
    const polygon = parseIsochrone(sv.isochrone_polygon)
    const distanzKm = haversineKm(lat, lng, sv.standort_lat, sv.standort_lng)

    if (polygon && polygon.length >= 3) {
      if (!pointInPolygon([lng, lat], polygon)) continue
    } else {
      // Kein Polygon → 80-km-Radius-Fallback
      if (distanzKm > 80) continue
    }

    svKandidaten.push({ ...sv, distanzKm })
  }

  if (svKandidaten.length > 0) {
    svKandidaten.sort((a, b) => a.distanzKm - b.distanzKm)
    const best = svKandidaten[0]
    return {
      ok: true,
      typ: 'sv',
      svId: best.id,
      svLeadId: null,
      svName: best.firmenname ?? 'Sachverständiger',
      distanzKm: Math.round(best.distanzKm * 10) / 10,
    }
  }

  // ── Priorität 2: sv_leads — 30-km-Radius, Kalender immer frei ──
  // ⚠ Ohne `range` liefert PostgREST still hoechstens 1.000 Zeilen. Bei 9.712
  // aktiven Leads mit Koordinaten (prod, 09.09.2026) sah dieser Pfad 10 % des
  // Bestands — und ohne ORDER BY bei jedem Aufruf potenziell ANDERE 10 %. Der
  // naechste Sachverstaendige konnte damit schlicht unsichtbar sein.
  //
  // Zwei Massnahmen, die zusammengehoeren:
  //  1. Die Umkreis-Box zieht den Radius-Filter in die DB (nutzt den
  //     vorhandenen Index `sv_leads_lat_lng_idx`) — statt 9.712 Zeilen kommen
  //     im dichtesten gemessenen Fenster 636 zurueck.
  //  2. `alleSeiten` garantiert Vollstaendigkeit trotzdem: waechst der Bestand,
  //     holt es eine zweite Seite, statt still zu schneiden. Die Box senkt die
  //     Kosten, sie ist NICHT die Garantie.
  const box = umkreisBox(lat, lng, LEAD_RADIUS_KM)
  const leadsGelesen = await alleSeiten<SvLeadKandidat>((von, bis) =>
    supabase
      .from('sv_leads')
      .select('id, name, vorname, lat, lng')
      .eq('ist_aktiv', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', box.latVon)
      .lte('lat', box.latBis)
      .gte('lng', box.lngVon)
      .lte('lng', box.lngBis)
      // Ein Zweitschluessel ist Pflicht: ohne stabile Reihenfolge kann dieselbe
      // Zeile auf zwei Seiten erscheinen — oder auf keiner.
      .order('id', { ascending: true })
      .range(von, bis),
  )
  if (!leadsGelesen.ok) {
    // Vorher wurde der Lesefehler verworfen: der Kunde bekam „Kein
    // Sachverstaendiger in Ihrer Naehe" — eine falsche Aussage ueber die
    // Datenlage. Ein Fehlschlag ist etwas anderes als ein leeres Ergebnis.
    console.error('[matcheSvFuerWizard] sv_leads:', leadsGelesen.error)
    return { ok: false, error: 'Die Suche ist gerade nicht möglich. Bitte versuchen Sie es erneut.' }
  }

  const leadKandidaten: (SvLeadKandidat & { distanzKm: number })[] = []

  // Die Box ist ein Superset des Kreises — ihre Ecken liegen weiter als der
  // Radius. Der Haversine-Filter bleibt deshalb unveraendert stehen.
  for (const lead of leadsGelesen.zeilen) {
    const distanzKm = haversineKm(lat, lng, lead.lat, lead.lng)
    if (distanzKm > LEAD_RADIUS_KM) continue
    leadKandidaten.push({ ...lead, distanzKm })
  }

  if (leadKandidaten.length > 0) {
    leadKandidaten.sort((a, b) => a.distanzKm - b.distanzKm)
    const best = leadKandidaten[0]
    const name = [best.vorname, best.name].filter(Boolean).join(' ') || 'Kfz-Sachverständiger'
    return {
      ok: true,
      typ: 'lead',
      svId: null,
      svLeadId: best.id,
      svName: name,
      distanzKm: Math.round(best.distanzKm * 10) / 10,
    }
  }

  return { ok: false, error: 'Kein Sachverständiger in Ihrer Nähe verfügbar' }
}

// Speichert die finale SV-Zuordnung nach Wizard-Abschluss auf die GFA.
export async function speichereZuordnung(
  anfrageId: string,
  match: Extract<SvMatchResult, { ok: true }>,
): Promise<void> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('gutachter_finder_anfragen')
    .update(
      match.typ === 'sv'
        ? { zugeordneter_sv_id: match.svId, matching_typ: 'isochron' }
        : { zugeordneter_sv_lead_id: match.svLeadId, matching_typ: 'lead_fallback' },
    )
    .eq('id', anfrageId)
}
