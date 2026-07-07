// Health-Check: Termine-Missing-Reminders
// Erkennt bestaetigte Zukunfts-Gutachter-Termine ohne Kunden-Reminder
// (termin_reminders). Ohne Reminder kein Erinnerungs-Versand -> No-Show-Risiko:
// der Queuer (generateReminderForTermin) feuerte beim Buchen/Bestaetigen nicht.
// dispatch_pending/storniert/verschoben/abgeschlossen sind bewusst ausgeschlossen
// (nur 'bestaetigt' erwartet einen Reminder).
// Read-only: gutachter_termine.id/start_zeit/status + termin_reminders.termin_id.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const CRIT_SCHWELLE = 3

type TerminIdRow = { id: string }
type ReminderRow = { termin_id: string }

export const termineMissingRemindersCheck: HealthCheck = {
  id: 'termine-missing-reminders',
  category: 'cron',
  title: 'Bestätigte Termine ohne Reminder',

  async run(ctx): Promise<CheckResult> {
    const nowIso = new Date().toISOString()

    // Query 1: bestaetigte Zukunfts-Termine (Kandidaten)
    const { data: terminData, error: terminError } = await ctx.supabase
      .from('gutachter_termine')
      .select('id')
      .gt('start_zeit', nowIso)
      .eq('status', 'bestaetigt')

    if (terminError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Termine: ${terminError.message}` }
    }

    const candidateIds = ((terminData ?? []) as TerminIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine bestätigten Zukunfts-Termine vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN Reminder
    const { data: reminderData, error: reminderError } = await ctx.supabase
      .from('termin_reminders')
      .select('termin_id')
      .in('termin_id', candidateIds)

    if (reminderError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Termin-Reminder: ${reminderError.message}` }
    }

    const mitReminder = new Set(((reminderData ?? []) as ReminderRow[]).map((r) => r.termin_id))
    const fehlend = candidateIds.filter((id) => !mitReminder.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} bestätigten Zukunfts-Termine haben Reminder.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} bestätigte Zukunfts-Termine ohne Reminder — der Queuer (generateReminderForTermin) feuerte beim Buchen/Bestätigen nicht, Kunde bekommt keine Termin-Erinnerung.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
