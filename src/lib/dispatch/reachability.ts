// AAR-CMM: Reachability-Check für SV-Termin-Reservierungen.
//
// Prüft ob ein Sachverständiger einen geplanten Termin erreichen kann —
// unter Berücksichtigung des direkt vorhergehenden und nachfolgenden
// Termins (jeweils im ±4h-Fenster). Nutzt Mapbox-Matrix für die ETA und
// vergleicht mit der verfügbaren Zeitlücke.
//
// Wird von allen Schreibseiten verwendet (reserveSvTerminForLead,
// acceptGegenvorschlag, listSvsByDistance), damit die Validierung an
// einer zentralen Stelle lebt.

import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'

const ETA_SICHERHEITS_PUFFER_MIN = 5
const ADJACENT_WINDOW_HOURS = 4

export type ReachabilityInput = {
  svId: string
  candidateLat: number
  candidateLng: number
  candidateStartIso: string
  candidateEndIso: string
  /** Optional: zu ignorierende Termin-IDs (z.B. der gerade verlegt wird). */
  ignoreTerminIds?: string[]
}

export type ReachabilityResult = {
  reachable: boolean
  grund?: string
  etaFromPrevMin?: number
  etaToNextMin?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Lädt Vorgänger-/Nachfolge-Termin (±4h um Candidate) und prüft via Mapbox-
 * ETA, ob der SV alle drei Termine zeitlich schaffen kann. Bei Mapbox-
 * Ausfall fail-open (reachable=true) — wir blockieren keinen Termin nur
 * weil eine externe API nicht antwortet.
 */
export async function checkSvReachability(
  db: SupabaseLike,
  input: ReachabilityInput,
): Promise<ReachabilityResult> {
  const candidateStart = new Date(input.candidateStartIso)
  const candidateEnd = new Date(input.candidateEndIso)
  if (Number.isNaN(candidateStart.getTime()) || Number.isNaN(candidateEnd.getTime())) {
    return { reachable: true } // ungültiger Input — Aufrufer muss vorher validieren
  }

  const windowStart = new Date(candidateStart.getTime() - ADJACENT_WINDOW_HOURS * 3600_000).toISOString()
  const windowEnd = new Date(candidateEnd.getTime() + ADJACENT_WINDOW_HOURS * 3600_000).toISOString()

  let query = db
    .from('gutachter_termine')
    .select('id, lead_id, fall_id, start_zeit, end_zeit')
    .eq('sv_id', input.svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .gte('end_zeit', windowStart)
    .lte('start_zeit', windowEnd)

  if (input.ignoreTerminIds && input.ignoreTerminIds.length > 0) {
    query = query.not('id', 'in', `(${input.ignoreTerminIds.join(',')})`)
  }
  const { data: termineRaw } = await query

  const termine = (termineRaw ?? []) as Array<{
    id: string
    lead_id: string | null
    fall_id: string | null
    start_zeit: string
    end_zeit: string
  }>

  // Vorgänger = letzter Termin der vor dem Candidate endet
  const prev = termine
    .filter((t) => new Date(t.end_zeit).getTime() <= candidateStart.getTime())
    .sort((a, b) => new Date(b.end_zeit).getTime() - new Date(a.end_zeit).getTime())[0] ?? null
  // Nachfolger = erster Termin der nach dem Candidate beginnt
  const next = termine
    .filter((t) => new Date(t.start_zeit).getTime() >= candidateEnd.getTime())
    .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())[0] ?? null

  if (!prev && !next) return { reachable: true }

  // Locations für prev/next aus lead/faelle.besichtigungsort_lat/lng holen
  const idsToFetch = {
    leads: [] as string[],
    faelle: [] as string[],
  }
  for (const t of [prev, next].filter((x): x is NonNullable<typeof x> => !!x)) {
    if (t.fall_id) idsToFetch.faelle.push(t.fall_id)
    else if (t.lead_id) idsToFetch.leads.push(t.lead_id)
  }

  const [{ data: leadLocs }, { data: fallLocs }] = await Promise.all([
    idsToFetch.leads.length
      ? db.from('leads').select('id, besichtigungsort_lat, besichtigungsort_lng').in('id', idsToFetch.leads)
      : Promise.resolve({ data: [] }),
    idsToFetch.faelle.length
      ? db.from('faelle').select('id, besichtigungsort_lat, besichtigungsort_lng').in('id', idsToFetch.faelle)
      : Promise.resolve({ data: [] }),
  ])

  const leadLocMap = new Map(
    ((leadLocs ?? []) as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>)
      .map((l) => [l.id, { lat: l.besichtigungsort_lat, lng: l.besichtigungsort_lng }]),
  )
  const fallLocMap = new Map(
    ((fallLocs ?? []) as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>)
      .map((f) => [f.id, { lat: f.besichtigungsort_lat, lng: f.besichtigungsort_lng }]),
  )

  function locOf(t: { lead_id: string | null; fall_id: string | null }): { lat: number; lng: number } | null {
    if (t.fall_id) {
      const l = fallLocMap.get(t.fall_id)
      if (l?.lat != null && l?.lng != null) return { lat: l.lat, lng: l.lng }
    }
    if (t.lead_id) {
      const l = leadLocMap.get(t.lead_id)
      if (l?.lat != null && l?.lng != null) return { lat: l.lat, lng: l.lng }
    }
    return null
  }

  const prevLoc = prev ? locOf(prev) : null
  const nextLoc = next ? locOf(next) : null

  const adjLocs: Array<{ lat: number; lng: number }> = []
  let prevIdx = -1
  let nextIdx = -1
  if (prevLoc) {
    prevIdx = adjLocs.length
    adjLocs.push(prevLoc)
  }
  if (nextLoc) {
    nextIdx = adjLocs.length
    adjLocs.push(nextLoc)
  }
  if (adjLocs.length === 0) return { reachable: true } // keine Locations → fail-open

  const etas = await mapboxEtaMatrix(
    { lat: input.candidateLat, lng: input.candidateLng },
    adjLocs,
  )

  const etaFromPrevMin = prevIdx >= 0 ? etas[prevIdx] ?? null : null
  const etaToNextMin = nextIdx >= 0 ? etas[nextIdx] ?? null : null

  // Validierung Vorgänger
  if (prev && etaFromPrevMin != null) {
    const verfMin = (candidateStart.getTime() - new Date(prev.end_zeit).getTime()) / 60_000
    if (etaFromPrevMin + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
      return {
        reachable: false,
        grund: `SV erreicht den Termin nicht — ${etaFromPrevMin} min Fahrt vom Vortermin, nur ${Math.round(verfMin)} min Lücke (5 min Puffer benötigt).`,
        etaFromPrevMin,
        etaToNextMin: etaToNextMin ?? undefined,
      }
    }
  }

  // Validierung Nachfolger
  if (next && etaToNextMin != null) {
    const verfMin = (new Date(next.start_zeit).getTime() - candidateEnd.getTime()) / 60_000
    if (etaToNextMin + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
      return {
        reachable: false,
        grund: `SV schafft den Folgetermin nicht — ${etaToNextMin} min Fahrt zum nächsten Termin, nur ${Math.round(verfMin)} min Lücke (5 min Puffer benötigt).`,
        etaFromPrevMin: etaFromPrevMin ?? undefined,
        etaToNextMin,
      }
    }
  }

  return {
    reachable: true,
    etaFromPrevMin: etaFromPrevMin ?? undefined,
    etaToNextMin: etaToNextMin ?? undefined,
  }
}

// ─── PR B: Slot-Iterator-Reachability ──────────────────────────────────────
//
// Die Slot-Finder iterieren bis zu ~2400 Kandidat-Slots über 12 Wochen.
// Mapbox-Calls pro Slot wären zu teuer. Strategie:
//   1. Einmal pro SV: alle Termine im Suchzeitraum laden + Locations (Lead/Fall)
//   2. Eine Matrix-Call: Origin = Candidate-Location, Destinations = alle
//      Termin-Locations dieses SV → ETA-Map
//   3. Pro Slot rein lokal mit der ETA-Map prüfen: ist Vorgänger/Nachfolger
//      erreichbar?

export type TerminMitEta = {
  id: string
  startZeit: string
  endZeit: string
  /** Mapbox-ETA candidate ↔ Termin-Location in Minuten. null wenn nicht ermittelbar. */
  etaMin: number | null
}

export type SlotEtaContext = {
  termine: TerminMitEta[]
}

/**
 * Lädt alle Termine eines SV im Suchzeitraum + Mapbox-ETAs zur Candidate-
 * Location. Wird einmal aufgerufen, dann beliebig oft an `isSlotReachable`
 * weitergegeben — kein Mapbox-Call pro Slot.
 */
export async function precomputeSvSlotEtas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  svId: string,
  candidate: { lat: number; lng: number },
  fromIso: string,
  toIso: string,
): Promise<SlotEtaContext> {
  const { data: termineRaw } = await db
    .from('gutachter_termine')
    .select('id, lead_id, fall_id, start_zeit, end_zeit')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .gte('end_zeit', fromIso)
    .lte('start_zeit', toIso)
    .order('start_zeit', { ascending: true })

  const termine = (termineRaw ?? []) as Array<{
    id: string
    lead_id: string | null
    fall_id: string | null
    start_zeit: string
    end_zeit: string
  }>

  if (termine.length === 0) return { termine: [] }

  const leadIds = Array.from(new Set(termine.map((t) => t.lead_id).filter((x): x is string => !!x)))
  const fallIds = Array.from(new Set(termine.map((t) => t.fall_id).filter((x): x is string => !!x)))

  const [{ data: leadLocs }, { data: fallLocs }] = await Promise.all([
    leadIds.length
      ? db.from('leads').select('id, besichtigungsort_lat, besichtigungsort_lng').in('id', leadIds)
      : Promise.resolve({ data: [] }),
    fallIds.length
      ? db.from('faelle').select('id, besichtigungsort_lat, besichtigungsort_lng').in('id', fallIds)
      : Promise.resolve({ data: [] }),
  ])

  const leadLocMap = new Map(
    ((leadLocs ?? []) as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>)
      .map((l) => [l.id, { lat: l.besichtigungsort_lat, lng: l.besichtigungsort_lng }]),
  )
  const fallLocMap = new Map(
    ((fallLocs ?? []) as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>)
      .map((f) => [f.id, { lat: f.besichtigungsort_lat, lng: f.besichtigungsort_lng }]),
  )

  // Lokationen pro Termin auflösen
  const terminLocs: Array<{ idx: number; lat: number; lng: number }> = []
  const terminMitEta: TerminMitEta[] = []
  termine.forEach((t, idx) => {
    let lat: number | null = null
    let lng: number | null = null
    if (t.fall_id) {
      const l = fallLocMap.get(t.fall_id)
      if (l?.lat != null && l?.lng != null) {
        lat = l.lat
        lng = l.lng
      }
    }
    if (lat == null && t.lead_id) {
      const l = leadLocMap.get(t.lead_id)
      if (l?.lat != null && l?.lng != null) {
        lat = l.lat
        lng = l.lng
      }
    }
    terminMitEta.push({ id: t.id, startZeit: t.start_zeit, endZeit: t.end_zeit, etaMin: null })
    if (lat != null && lng != null) {
      terminLocs.push({ idx, lat, lng })
    }
  })

  // Eine Matrix-Call: candidate ↔ alle Termin-Locations
  if (terminLocs.length > 0) {
    const etas = await mapboxEtaMatrix(
      candidate,
      terminLocs.map((tl) => ({ lat: tl.lat, lng: tl.lng })),
    )
    terminLocs.forEach((tl, k) => {
      terminMitEta[tl.idx].etaMin = etas[k]
    })
  }

  return { termine: terminMitEta }
}

/**
 * Pure Funktion: Ist der Slot-Kandidat vom direkten Vorgänger erreichbar
 * UND der direkte Nachfolger noch erreichbar? Nutzt nur die in `ctx`
 * vorgewärmten ETAs — kein I/O.
 */
export function isSlotReachable(
  slotStart: Date,
  slotEnd: Date,
  ctx: SlotEtaContext,
): { reachable: boolean; grund?: string } {
  const slotStartMs = slotStart.getTime()
  const slotEndMs = slotEnd.getTime()

  // Vorgänger: spätester Termin der vor slotStart endet
  let prev: TerminMitEta | null = null
  for (const t of ctx.termine) {
    if (new Date(t.endZeit).getTime() <= slotStartMs) {
      if (!prev || new Date(t.endZeit).getTime() > new Date(prev.endZeit).getTime()) prev = t
    }
  }
  // Nachfolger: frühester Termin der nach slotEnd beginnt
  let next: TerminMitEta | null = null
  for (const t of ctx.termine) {
    if (new Date(t.startZeit).getTime() >= slotEndMs) {
      if (!next || new Date(t.startZeit).getTime() < new Date(next.startZeit).getTime()) next = t
    }
  }

  if (prev && prev.etaMin != null) {
    const verfMin = (slotStartMs - new Date(prev.endZeit).getTime()) / 60_000
    if (prev.etaMin + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
      return {
        reachable: false,
        grund: `${prev.etaMin} min Fahrt vom Vortermin, nur ${Math.round(verfMin)} min Lücke`,
      }
    }
  }
  if (next && next.etaMin != null) {
    const verfMin = (new Date(next.startZeit).getTime() - slotEndMs) / 60_000
    if (next.etaMin + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
      return {
        reachable: false,
        grund: `${next.etaMin} min Fahrt zum Folgetermin, nur ${Math.round(verfMin)} min Lücke`,
      }
    }
  }
  return { reachable: true }
}
