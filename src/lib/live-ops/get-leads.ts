import { createAdminClient } from '@/lib/supabase/admin'
import type { LiveOpsScope, LeadPin } from './types'

// Geo-Aufloesungs-Hilfsfunktion:
// Leads haben besichtigungsort_lat/lng (Wunschort), unfallort_lat/lng,
// und als Fallback kunde_plz + plz_geo.

type RawLead = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  status: string | null
  source_channel: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  unfallort_lat: number | null
  unfallort_lng: number | null
  kunde_plz: string | null
  kunde_stadt: string | null
  halter_plz: string | null
  halter_stadt: string | null
  created_at: string | null
}

type PlzRow = { plz: string; lat: number; lng: number; ort: string | null }

function resolveName(lead: RawLead): string {
  if (lead.firma_name) return lead.firma_name
  const parts = [lead.vorname, lead.nachname].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Unbekannt'
}

/**
 * Laedt offene Leads (noch kein Fall, nicht disqualifiziert) mit Koordinaten
 * fuer die LiveOps-Karte. Nur fuer admin + dispatch sichtbar — KB erhaelt [].
 */
export async function getLeads(scope: LiveOpsScope): Promise<LeadPin[]> {
  // KB sieht keine Leads.
  if (scope.role === 'kundenbetreuer') return []

  const supabase = createAdminClient()

  // Offene Leads: nicht disqualifiziert, noch kein Fall.
  const { data: leads, error: lErr } = await supabase
    .from('leads')
    .select(
      `id, vorname, nachname, firma_name, status,
       source_channel,
       besichtigungsort_lat, besichtigungsort_lng,
       unfallort_lat, unfallort_lng,
       kunde_plz, kunde_stadt, halter_plz, halter_stadt, created_at`,
    )
    .or('disqualifiziert.is.null,disqualifiziert.eq.false')
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (lErr) {
    console.error('[getLeads] leads query failed', lErr)
    return []
  }
  if (!leads || leads.length === 0) return []

  // PLZ-Map fuer Geo-Fallback (analog zu triage-leads.ts).
  const { data: plzRows } = await supabase
    .from('plz_geo')
    .select('plz, lat, lng, ort' as 'plz, lat, lng')

  type PlzRowWithOrt = { plz: string; lat: number; lng: number; ort?: string | null }
  const plzMap = new Map<string, PlzRow>(
    ((plzRows ?? []) as unknown as PlzRowWithOrt[]).map((r) => [
      r.plz,
      { plz: r.plz, lat: Number(r.lat), lng: Number(r.lng), ort: r.ort ?? null },
    ]),
  )

  const pins: LeadPin[] = []

  for (const raw of leads as RawLead[]) {
    // Geo-Aufloesung: besichtigungsort > unfallort > plz_centroid
    let lat: number | null = null
    let lng: number | null = null
    let ort: string | null = raw.kunde_stadt ?? raw.halter_stadt ?? null

    if (typeof raw.besichtigungsort_lat === 'number' && typeof raw.besichtigungsort_lng === 'number') {
      lat = raw.besichtigungsort_lat
      lng = raw.besichtigungsort_lng
    } else if (typeof raw.unfallort_lat === 'number' && typeof raw.unfallort_lng === 'number') {
      lat = raw.unfallort_lat
      lng = raw.unfallort_lng
    } else {
      const plzCandidate = raw.kunde_plz ?? raw.halter_plz
      if (plzCandidate) {
        const hit = plzMap.get(plzCandidate)
        if (hit) {
          lat = hit.lat
          lng = hit.lng
          ort = hit.ort ?? ort
        }
      }
    }

    // Nur Leads mit Koordinaten als Pins inkludieren.
    if (lat == null || lng == null) continue

    pins.push({
      id: raw.id,
      name: resolveName(raw),
      status: raw.status ?? 'neu',
      lat,
      lng,
      ort,
      kanal: raw.source_channel ?? null,
      erstelltAm: raw.created_at ?? new Date(0).toISOString(),
      hasActiveTermin: false,
    })
  }

  // Aktive Termine (bereits zugewiesen) — separater READ, kein Join (Cardinality-sauber).
  // DB-verifizierte Storno-Werte (2026-07-05): nur "storniert" existiert als Abbruch-Status.
  // "bestaetigt", "abgeschlossen", "dispatch_pending", "verschoben" = aktiv/zugewiesen.
  const leadIds = pins.map((p) => p.id)
  const activeLeadIds = new Set<string>()
  if (leadIds.length > 0) {
    const { data: termine } = await supabase
      .from('gutachter_termine')
      .select('lead_id, status')
      .in('lead_id', leadIds)
      .not('status', 'in', '("storniert")')
    for (const t of termine ?? []) if (t.lead_id) activeLeadIds.add(t.lead_id as string)
  }
  return applyHasActiveTermin(pins, activeLeadIds)
}

export function applyHasActiveTermin(pins: LeadPin[], activeLeadIds: Set<string>): LeadPin[] {
  return pins.map((p) => ({ ...p, hasActiveTermin: activeLeadIds.has(p.id) }))
}
