// Health-Check: Twilio-Send-Failures (WA/SMS)
// Erkennt Cluster fehlgeschlagener WhatsApp/SMS-Sends (failed/undelivered) — z.B.
// schlechte Sender-Nummer, Meta-Ablehnung, kaputtes Template, Nummer blockiert.
// Read-only auf twilio_status_events.
//
// ABSOLUTER Zähler (keine Quote): twilio_status_events loggt NUR Failures (der
// StatusCallback /api/webhooks/twilio/status filtert failed/undelivered), es gibt
// kein Total-Sends-Log für eine Rate wie bei email-failure-rate. Bei WA-Failure setzt
// die Route bevorzugter_kanal->sms zurück (Selbstheilung pro Empfänger); dieser Check
// macht systemische Cluster über alle Empfänger sichtbar. Tabelle: Migration
// 20260703203257. Schwellen unten sind bewusst konservativ + tunbar.

import type { HealthCheck, CheckResult } from '@/lib/health/types'

const FENSTER_TAGE = 7
const WARN_AB = 5 // >= 5 Failures im Fenster -> warn
const CRIT_AB = 20 // >= 20 -> crit (systemisch)

export type SendFailureRow = { error_code: string | null }

/**
 * Reine Bewertung: Anzahl Failures im Fenster -> Status + Detail (mit häufigstem
 * Fehlercode fürs Debugging). Voll testbar ohne DB.
 */
export function evaluateSendFailures(
  rows: SendFailureRow[],
  warnAb: number,
  critAb: number,
  fensterTage: number,
): CheckResult {
  const n = rows.length
  const status: 'ok' | 'warn' | 'crit' = n >= critAb ? 'crit' : n >= warnAb ? 'warn' : 'ok'

  // Häufigsten Fehlercode ermitteln (Debug-Hinweis).
  const byCode = new Map<string, number>()
  for (const r of rows) {
    const c = (r.error_code ?? '').trim() || '—'
    byCode.set(c, (byCode.get(c) ?? 0) + 1)
  }
  const top = [...byCode.entries()].sort((a, b) => b[1] - a[1])[0]
  const topStr = top ? ` (häufigster Fehlercode ${top[0]}: ${top[1]}×)` : ''

  const detail =
    n === 0
      ? `Keine fehlgeschlagenen WA/SMS-Sends in ${fensterTage} T`
      : `${n} fehlgeschlagene WA/SMS-Sends in ${fensterTage} T${topStr}${
          status !== 'ok' ? ' — Sender-Nummer/Template/Meta-Freigabe prüfen' : ''
        }`

  return { status, metric: n, detail }
}

export const twilioSendFailuresCheck: HealthCheck = {
  id: 'twilio-send-failures',
  category: 'sends',
  title: 'Twilio-Send-Failures (WA/SMS, 7T)',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - FENSTER_TAGE * 86_400_000).toISOString()

    const { data, error } = await ctx.supabase
      .from('twilio_status_events')
      .select('error_code')
      .gte('created_at', cutoff)

    if (error) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Twilio-Status-Events: ${error.message}` }
    }

    return evaluateSendFailures((data ?? []) as SendFailureRow[], WARN_AB, CRIT_AB, FENSTER_TAGE)
  },
}
