// Health-Check: Email-Failure-Rate
// Erkennt hohe Email-Fehlerraten im letzten 24h-Fenster.
// Read-only auf email_log.status + created_at.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task4
//
// WICHTIG: Kein roh-SQL in .select() — Zeilen via PostgREST-Filter fetchen,
// Aggregation in JS (sent/failed zaehlen per Array.filter).

import type { HealthCheck, CheckResult } from '@/lib/health/types'

// Schwellwerte fuer Email-Fehlerrate
const WARN_RATE = 0.1 // > 10% -> warn
const CRIT_RATE = 0.3 // > 30% -> crit
const FLOOR_TOTAL = 5 // < 5 Mails -> kein Urteil (ok)

type EmailLogRow = {
  status: string
}

export const emailFailureRateCheck: HealthCheck = {
  id: 'email-failure-rate',
  category: 'sends',
  title: 'Email-Fehlerrate (24h)',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    // Zeilen-basierter Fetch: nur Spaltennamen, kein SQL im select().
    // JS aggregiert sent/failed/bounced aus den Zeilen.
    const { data, error } = await ctx.supabase
      .from('email_log')
      .select('status')
      .gte('created_at', cutoff)

    if (error) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Laden der Email-Logs: ${error.message}`,
      }
    }

    const rows: EmailLogRow[] = (data ?? []) as EmailLogRow[]

    // JS-seitige Aggregation
    const sent = rows.filter((r) => r.status === 'sent').length
    const failed = rows.filter((r) => r.status === 'failed' || r.status === 'bounced').length
    const total = sent + failed

    // Floor: zu wenig Daten fuer sinnvolles Urteil
    if (total < FLOOR_TOTAL) {
      return {
        status: 'ok',
        metric: total > 0 ? failed / total : 0,
        detail: `Zu wenig Emails in 24h (${total} gesamt) — kein Urteil moeglich.`,
      }
    }

    const rate = failed / total
    const pctStr = `${Math.round(rate * 100)}%`

    if (rate > CRIT_RATE) {
      return {
        status: 'crit',
        metric: rate,
        detail: `${pctStr} Email-Fehlerrate (24h): ${failed}/${total} fehlgeschlagen — Email-Versand kritisch gestört`,
      }
    }

    if (rate > WARN_RATE) {
      return {
        status: 'warn',
        metric: rate,
        detail: `${pctStr} Email-Fehlerrate (24h): ${failed}/${total} fehlgeschlagen`,
      }
    }

    return {
      status: 'ok',
      metric: rate,
      detail: `${pctStr} Email-Fehlerrate (24h): ${failed}/${total} fehlgeschlagen — im Normalbereich`,
    }
  },
}
