import { createAdminClient } from '@/lib/supabase/admin'
import { berechneFahrtzeit } from '@/lib/routing/fahrtzeit'

const PUFFER_SEK = 10 * 60 // 10 Minuten Puffer
const LUECKE_GRENZE_MS = 4 * 60 * 60 * 1000 // 4 Stunden

interface TerminData {
  id: string
  sv_id: string
  fall_id: string
  start_zeit: string
  end_zeit: string | null
}

/**
 * Berechnet die SV-Reminder-Zeit:
 * - Vorheriger Termin am gleichen Tag mit <4h Lücke → Routing vom letzten Termin
 * - Sonst → Routing vom SV-Büro (standort_lat/lng)
 *
 * Gibt null zurück wenn keine Berechnung möglich (fehlende Koordinaten).
 */
export async function berechneSvReminderZeit(termin: TerminData): Promise<Date | null> {
  const supabase = createAdminClient()
  const startZeit = new Date(termin.start_zeit)

  // SV-Daten laden (standort_lat/lng)
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng')
    .eq('id', termin.sv_id)
    .single()

  if (!sv) return null

  // CMM-44 SP-D PR2a: besichtigungsort_lat/lng aus gutachter_termine (SSoT).
  // termin ist selbst ein gutachter_termine-Row — direkt per id laden.
  const { data: terminLoc } = await supabase
    .from('gutachter_termine')
    .select('besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', termin.id)
    .single()

  const terminLat = terminLoc?.besichtigungsort_lat
  const terminLng = terminLoc?.besichtigungsort_lng

  if (!terminLat || !terminLng) {
    console.warn(`[sv-reminder] Keine Besichtigungsort-Koordinaten fuer Termin ${termin.id}`)
    return null
  }

  // Termintag-Grenzen in UTC ermitteln (basierend auf Berlin-Datum)
  const berlinDateStr = startZeit.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const dayStart = new Date(`${berlinDateStr}T00:00:00Z`)
  const dayEnd = new Date(`${berlinDateStr}T23:59:59Z`)

  // Vorherigen Termin am gleichen Tag suchen
  // CMM-44 SP-D PR2a: besichtigungsort_lat/lng direkt aus gutachter_termine (SSoT).
  const { data: vorherigeTermine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, end_zeit, besichtigungsort_lat, besichtigungsort_lng')
    .eq('sv_id', termin.sv_id)
    .neq('id', termin.id)
    .in('status', ['reserviert', 'bestaetigt'])
    .gte('start_zeit', dayStart.toISOString())
    .lte('start_zeit', dayEnd.toISOString())
    .lt('start_zeit', termin.start_zeit)
    .order('start_zeit', { ascending: false })
    .limit(1)

  const vorig = vorherigeTermine?.[0]
  let fahrzeitSek: number

  if (vorig) {
    const vorigEnd = new Date(vorig.end_zeit || vorig.start_zeit)
    const lueckeMs = startZeit.getTime() - vorigEnd.getTime()

    if (lueckeMs < LUECKE_GRENZE_MS) {
      // Routing vom vorherigen Termin
      // CMM-44 SP-D PR2a: besichtigungsort_lat/lng aus gutachter_termine-Row selbst.
      if (vorig.besichtigungsort_lat && vorig.besichtigungsort_lng) {
        fahrzeitSek = await berechneFahrtzeit(
          vorig.besichtigungsort_lat, vorig.besichtigungsort_lng,
          terminLat, terminLng,
        )
        console.log(`[sv-reminder] Termin->Termin Routing: ${Math.ceil(fahrzeitSek / 60)}min`)
      } else {
        // Fallback auf SV-Büro
        fahrzeitSek = await routeFromSvOffice(sv, terminLat, terminLng)
      }
    } else {
      // Lücke >= 4h → vom Büro
      fahrzeitSek = await routeFromSvOffice(sv, terminLat, terminLng)
    }
  } else {
    // Erster Termin des Tages → vom Büro
    fahrzeitSek = await routeFromSvOffice(sv, terminLat, terminLng)
  }

  // SV-Reminder = start_zeit - fahrtzeit - 10min Puffer
  const reminderTime = new Date(startZeit.getTime() - (fahrzeitSek + PUFFER_SEK) * 1000)
  return reminderTime
}

async function routeFromSvOffice(
  sv: { standort_lat: number | null; standort_lng: number | null },
  terminLat: number, terminLng: number,
): Promise<number> {
  if (!sv.standort_lat || !sv.standort_lng) {
    console.warn(`[sv-reminder] SV hat keine Standort-Koordinaten, Default 30min`)
    return 30 * 60 // 30 Minuten Fallback
  }
  const sek = await berechneFahrtzeit(sv.standort_lat, sv.standort_lng, terminLat, terminLng)
  console.log(`[sv-reminder] Büro→Termin Routing: ${Math.ceil(sek / 60)}min`)
  return sek
}
