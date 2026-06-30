// Health-Check: Webhook-Inbound-Silent
// Erkennt fehlende Inbound-Webhooks vom LexDrive-Rueckkanal.
// Read-only auf webhook_events.created_at (letzter Eintrag).
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task4
//
// WICHTIG: Kein roh-SQL in .select() — max(created_at) via .order+.limit(1) fetchen,
// Altersberechnung in JS.

import type { HealthCheck, CheckResult } from '@/lib/health/types'

// Schwellwerte in Tagen
const WARN_TAGE = 7   // > 7 Tage -> warn
const CRIT_TAGE = 30  // > 30 Tage -> crit

type WebhookRow = {
  created_at: string
}

export const webhookInboundSilentCheck: HealthCheck = {
  id: 'webhook-inbound-silent',
  category: 'sends',
  title: 'Inbound-Webhook-Stille (LexDrive)',

  async run(ctx): Promise<CheckResult> {
    // Zeilen-basierter Fetch: neuesten Eintrag via .order+.limit(1).
    // JS berechnet Alter aus created_at — kein extract/now() im select().
    const { data, error } = await ctx.supabase
      .from('webhook_events')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Pruefen der Webhook-Events: ${error.message}`,
      }
    }

    const rows: WebhookRow[] = (data ?? []) as WebhookRow[]

    // JS-seitige Altersberechnung: floor auf volle Tage fuer stabile Schwellenvergleiche.
    const tageSeitLetztemRaw: number | null =
      rows.length > 0
        ? (Date.now() - new Date(rows[0].created_at).getTime()) / 86_400_000
        : null

    const tageSeitLetztem: number | null =
      tageSeitLetztemRaw !== null ? Math.floor(tageSeitLetztemRaw) : null

    // Noch nie ein Inbound-Webhook empfangen
    if (tageSeitLetztem === null) {
      return {
        status: 'crit',
        detail: 'Noch nie ein Inbound-Webhook empfangen — LexDrive-Rückkanal prüfen',
      }
    }

    if (tageSeitLetztem > CRIT_TAGE) {
      return {
        status: 'crit',
        metric: tageSeitLetztem,
        detail: `Letztes Inbound-Webhook vor ${tageSeitLetztem} Tagen — LexDrive-Rückkanal prüfen`,
      }
    }

    if (tageSeitLetztem > WARN_TAGE) {
      return {
        status: 'warn',
        metric: tageSeitLetztem,
        detail: `Letztes Inbound-Webhook vor ${tageSeitLetztem} Tagen — LexDrive-Rückkanal prüfen`,
      }
    }

    return {
      status: 'ok',
      metric: tageSeitLetztem,
      detail: `Letztes Inbound-Webhook vor ${tageSeitLetztem} Tagen — aktiv`,
    }
  },
}
