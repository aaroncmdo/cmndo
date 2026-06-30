// Health-Check: Reminders-Overdue
// Erkennt task_reminders, die der Cron haette senden muessen (pending + faellig),
// sowie eine erhoehte Fehlerrate der letzten 48h.
// Read-only auf task_reminders.status, geplant_fuer, created_at.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task3

import type { HealthCheck, CheckResult } from '@/lib/health/types'

// Schwelle: ueberfallige Reminder aelter als 24h -> crit
const CRIT_ALTER_H = 24
// Schwelle: Failure-Rate bei ausreichend Gesamtmenge
const FAIL_RATE_WARN = 0.2
const FAIL_RATE_MIN_TOTAL = 5

type OverdueRow = {
  geplant_fuer: string
}

type RateRow = {
  status: string
}

export const remindersOverdueCheck: HealthCheck = {
  id: 'reminders-overdue',
  category: 'cron',
  title: 'Ueberfaellige Task-Reminder',

  async run(ctx): Promise<CheckResult> {
    // Query 1: Overdue (pending + faellig seit >2h) — Zeilen-basierter Fetch
    const cutoff2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    const { data: overdueData, error: overdueError } = await ctx.supabase
      .from('task_reminders')
      .select('geplant_fuer')
      .eq('status', 'pending')
      .lt('geplant_fuer', cutoff2h)

    if (overdueError) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Pruefen ueberfahriger Reminder: ${overdueError.message}`,
      }
    }

    // Query 2: Failure-Rate der letzten 48h — Zeilen-basierter Fetch mit 48h-Filter
    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    const { data: rateData, error: rateError } = await ctx.supabase
      .from('task_reminders')
      .select('status')
      .gte('created_at', cutoff48h)

    if (rateError) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Pruefen der Reminder-Fehlerrate: ${rateError.message}`,
      }
    }

    // JS-seitige Aggregation Query 1
    const overdueRows: OverdueRow[] = (overdueData ?? []) as OverdueRow[]
    const overdue = overdueRows.length
    const aeltesterH =
      overdueRows.length > 0
        ? Math.round(Math.max(...overdueRows.map((r) => (Date.now() - new Date(r.geplant_fuer).getTime()) / 3_600_000)))
        : null

    // JS-seitige Aggregation Query 2
    const rateRows: RateRow[] = (rateData ?? []) as RateRow[]
    const failed = rateRows.filter((r) => r.status === 'failed').length
    const total = rateRows.length

    // Failure-Rate-Warn-Bedingung
    const hasFehlerrate = total >= FAIL_RATE_MIN_TOTAL && failed / total > FAIL_RATE_WARN
    const fehlerrateProzent = total > 0 ? Math.round((failed / total) * 100) : 0

    // Schwellen auswerten
    const isCrit = aeltesterH !== null && aeltesterH > CRIT_ALTER_H
    const isWarn = overdue >= 1 || hasFehlerrate

    if (isCrit) {
      const alterAnzeige = aeltesterH >= 48 ? `${Math.round(aeltesterH / 24)}d` : `${aeltesterH}h`
      const parts: string[] = [`${overdue} überfällige Reminder (ältester ${alterAnzeige}) — Cron-Lauf prüfen`]
      if (hasFehlerrate) {
        parts.push(`Fehlerrate 48h: ${fehlerrateProzent}% (${failed}/${total})`)
      }
      return {
        status: 'crit',
        metric: overdue,
        detail: parts.join('; '),
      }
    }

    if (isWarn) {
      const parts: string[] = []
      if (overdue >= 1) {
        const alterAnzeige =
          aeltesterH !== null ? (aeltesterH >= 48 ? `${Math.round(aeltesterH / 24)}d` : `${aeltesterH}h`) : '?'
        parts.push(`${overdue} überfällige Reminder (ältester ${alterAnzeige})`)
      }
      if (hasFehlerrate) {
        parts.push(`Fehlerrate 48h: ${fehlerrateProzent}% (${failed}/${total}) — über Schwelle ${FAIL_RATE_WARN * 100}%`)
      }
      return {
        status: 'warn',
        metric: overdue,
        detail: parts.join('; '),
      }
    }

    return {
      status: 'ok',
      metric: 0,
      detail: 'Alle Reminder planmäßig versendet, Fehlerrate im Normalbereich.',
    }
  },
}
