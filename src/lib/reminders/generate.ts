import { createAdminClient } from '@/lib/supabase/admin'
import { berechneSvReminderZeit } from '@/lib/reminders/sv-reminder'

// ─── Timezone Helper ───────────────────────────────────────────────────────

/**
 * Erzeugt eine UTC-Date für eine bestimmte Uhrzeit in Europe/Berlin am selben Tag wie refDate.
 */
function berlinDateAt(refDate: Date, hour: number, minute: number = 0): Date {
  const dateStr = refDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const utcGuess = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  const berlinHourStr = utcGuess.toLocaleString('en-US', {
    timeZone: 'Europe/Berlin',
    hour: 'numeric',
    hour12: false,
  })
  const berlinHour = parseInt(berlinHourStr)
  const offsetMs = (hour - berlinHour) * 3600_000
  return new Date(utcGuess.getTime() + offsetMs)
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generiert 3 Reminder-Einträge für einen Termin:
 * - kunde_morgen: 07:00 Europe/Berlin am Termintag
 * - kunde_1h: start_zeit - 1h
 * - sv_route: start_zeit - Fahrtzeit - 10min Puffer
 *
 * INSERT ... ON CONFLICT (termin_id, reminder_typ)
 *   DO UPDATE SET geplant_fuer, status='pending', versuche=0
 */
export async function generateReminderForTermin(terminId: string): Promise<void> {
  const supabase = createAdminClient()

  // Termin laden
  const { data: termin, error: terminErr } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, lead_id, start_zeit, end_zeit, status')
    .eq('id', terminId)
    .single()

  if (terminErr || !termin) {
    console.error(`[reminder:generate] Termin ${terminId} nicht gefunden:`, terminErr?.message)
    return
  }

  // Nur für aktive Termine
  if (!['reserviert', 'bestaetigt'].includes(termin.status)) {
    console.log(`[reminder:generate] Termin ${terminId} hat Status "${termin.status}", überspringe`)
    return
  }

  const startZeit = new Date(termin.start_zeit)

  // 1. kunde_morgen — 07:00 Europe/Berlin am Termintag
  const kundeMorgen = berlinDateAt(startZeit, 7, 0)

  // 2. kunde_1h — start_zeit - 1h
  const kunde1h = new Date(startZeit.getTime() - 60 * 60 * 1000)

  // 3. sv_route — berechneSvReminderZeit
  const svRoute = await berechneSvReminderZeit({
    id: termin.id,
    sv_id: termin.sv_id,
    fall_id: termin.fall_id,
    start_zeit: termin.start_zeit,
    end_zeit: termin.end_zeit,
  })

  // Reminder-Einträge upserten
  const reminders: Array<{ termin_id: string; empfaenger: string; reminder_typ: string; geplant_fuer: string; status: string; versuche: number }> = [
    {
      termin_id: terminId,
      empfaenger: 'kunde',
      reminder_typ: 'kunde_morgen',
      geplant_fuer: kundeMorgen.toISOString(),
      status: 'pending',
      versuche: 0,
    },
    {
      termin_id: terminId,
      empfaenger: 'kunde',
      reminder_typ: 'kunde_1h',
      geplant_fuer: kunde1h.toISOString(),
      status: 'pending',
      versuche: 0,
    },
  ]

  if (svRoute) {
    reminders.push({
      termin_id: terminId,
      empfaenger: 'sv',
      reminder_typ: 'sv_route',
      geplant_fuer: svRoute.toISOString(),
      status: 'pending',
      versuche: 0,
    })
  } else {
    console.warn(`[reminder:generate] SV-Reminder für Termin ${terminId} konnte nicht berechnet werden (fehlende Koordinaten)`)
  }

  // Upsert: ON CONFLICT (termin_id, reminder_typ) → update
  for (const reminder of reminders) {
    const { error } = await supabase
      .from('termin_reminders')
      .upsert(reminder, { onConflict: 'termin_id,reminder_typ' })

    if (error) {
      console.error(`[reminder:generate] Upsert fehlgeschlagen für ${reminder.reminder_typ}:`, error.message)
    }
  }

  console.log(`[reminder:generate] ${reminders.length} Reminder für Termin ${terminId} generiert`)
}

/**
 * Storniert alle pending Reminder für einen Termin.
 */
export async function cancelRemindersForTermin(terminId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error, count } = await supabase
    .from('termin_reminders')
    .update({ status: 'cancelled' })
    .eq('termin_id', terminId)
    .eq('status', 'pending')

  if (error) {
    console.error(`[reminder:cancel] Fehler beim Stornieren für Termin ${terminId}:`, error.message)
    return
  }

  console.log(`[reminder:cancel] ${count ?? 0} Reminder für Termin ${terminId} storniert`)
}
