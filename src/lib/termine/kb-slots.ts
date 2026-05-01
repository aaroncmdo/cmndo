import { createAdminClient } from '@/lib/supabase/admin'
import { getSvBusySlots } from '@/lib/google-calendar/busy-slots'
import {
  KB_BERATUNG_DURATION_MIN,
  KB_BERATUNG_VORLAUF_H,
  KB_BERATUNG_REICHWEITE_TAGE,
} from './constants'

// DB format: {"mo":["09:00","17:00"],"di":["09:00","17:00"],...}
type DbWorkingHours = {
  [day: string]: [string, string] | null | undefined
}

// Map: JS weekday (from toLocaleDateString) -> DB key
const WEEKDAY_TO_DB: Record<string, string> = {
  monday: 'mo', tuesday: 'di', wednesday: 'mi',
  thursday: 'do', friday: 'fr', saturday: 'sa', sunday: 'so',
}

const DEFAULT_WORKING_HOURS: DbWorkingHours = {
  mo: ['09:00', '17:00'],
  di: ['09:00', '17:00'],
  mi: ['09:00', '17:00'],
  do: ['09:00', '17:00'],
  fr: ['09:00', '17:00'],
}

function parseTime(timeStr: string, baseDate: Date): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(baseDate)
  d.setHours(h, m, 0, 0)
  return d
}

export async function getAvailableKbSlots(
  kbId: string,
): Promise<Array<{ datum: string; uhrzeit: string }>> {
  const db = createAdminClient()
  const now = new Date()
  const earliestStart = new Date(now.getTime() + KB_BERATUNG_VORLAUF_H * 60 * 60 * 1000)

  // 1. Load KB working_hours
  const { data: kbProfile, error: profileErr } = await db
    .from('profiles')
    .select('working_hours')
    .eq('id', kbId)
    .single()

  if (profileErr) {
    console.error('[kb-slots] Profile-Fehler:', profileErr.message)
  }

  const workingHours: DbWorkingHours =
    (kbProfile?.working_hours as DbWorkingHours | null) ?? DEFAULT_WORKING_HOURS

  // 2. Load already-booked kb_beratung slots for this KB in the window
  const windowStart = now.toISOString()
  const windowEnd = new Date(
    now.getTime() + KB_BERATUNG_REICHWEITE_TAGE * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: booked, error: bookedErr } = await db
    .from('gutachter_termine')
    .select('start_zeit')
    .eq('kb_id', kbId)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .gte('start_zeit', windowStart)
    .lte('start_zeit', windowEnd)
    .is('cancelled_at', null)

  if (bookedErr) {
    console.error('[kb-slots] Booked-Fehler:', bookedErr.message)
  }

  const bookedTimes = new Set(
    (booked ?? []).map(b => {
      const d = new Date(b.start_zeit)
      // Normalize to minute-precision key
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    }),
  )

  // 2b. Google-Calendar-Busy-Slots des KBs (externe Termine, Urlaub, etc.).
  // Wenn der KB nicht mit Google verbunden ist, liefert der Helper [] —
  // dann blockieren nur die in Claimondo gebuchten Slots.
  let externalBusy: Array<{ start: number; end: number }> = []
  try {
    const busy = await getSvBusySlots(kbId, windowStart, windowEnd)
    externalBusy = busy.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }))
  } catch (err) {
    console.warn('[kb-slots] Google-FreeBusy-Lookup fehlgeschlagen:', err instanceof Error ? err.message : err)
  }

  const slots: Array<{ datum: string; uhrzeit: string }> = []

  // 3. Iterate days
  for (let dayOffset = 0; dayOffset < KB_BERATUNG_REICHWEITE_TAGE; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + dayOffset)
    day.setHours(0, 0, 0, 0)

    const dayNameEn = day
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase()
    const dbKey = WEEKDAY_TO_DB[dayNameEn]
    if (!dbKey) continue

    const wh = workingHours[dbKey]
    if (!wh || !Array.isArray(wh) || wh.length < 2) continue

    const dayStart = parseTime(wh[0], day)
    const dayEnd = parseTime(wh[1], day)

    // Generate 30-min slots within working hours
    let slotTime = new Date(dayStart)
    while (slotTime.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000 <= dayEnd.getTime()) {
      // Filter: must be at least VORLAUF_H in the future
      if (slotTime >= earliestStart) {
        // Build UTC key for booked check
        const utcKey = `${slotTime.getUTCFullYear()}-${String(slotTime.getUTCMonth() + 1).padStart(2, '0')}-${String(slotTime.getUTCDate()).padStart(2, '0')}T${String(slotTime.getUTCHours()).padStart(2, '0')}:${String(slotTime.getUTCMinutes()).padStart(2, '0')}`

        if (!bookedTimes.has(utcKey)) {
          // Prüfe Überlappung mit Google-Calendar-Busy
          const slotStart = slotTime.getTime()
          const slotEnd = slotStart + KB_BERATUNG_DURATION_MIN * 60 * 1000
          const busyOverlap = externalBusy.some(
            (b) => slotStart < b.end && slotEnd > b.start,
          )
          if (!busyOverlap) {
            const datum = slotTime.toISOString().split('T')[0]
            const uhrzeit = slotTime.toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
            slots.push({ datum, uhrzeit })
          }
        }
      }
      slotTime = new Date(slotTime.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000)
    }
  }

  // Sort by datum then uhrzeit
  slots.sort((a, b) => {
    const cmp = a.datum.localeCompare(b.datum)
    if (cmp !== 0) return cmp
    return a.uhrzeit.localeCompare(b.uhrzeit)
  })

  return slots
}
