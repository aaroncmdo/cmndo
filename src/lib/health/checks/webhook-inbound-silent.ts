// Health-Check: Webhook-Inbound-Silent (Multi-Channel).
// Erkennt fehlende Inbound-Webhooks der Partner-Rückkanäle. Read-only auf der
// jeweiligen Landing-Tabelle (letzte created_at); Altersberechnung in JS.
//
// Ursprung: LexDrive-Rückkanal (pipeline-observability §Task4). 03.07.2026 nach
// dem VPS-Umzug generalisiert: partner-seitige Webhook-URLs können noch auf der
// toten cmndo.vercel.app-Domain hängen (Code ist sauber, aber die Ziel-URL wird
// beim Partner konfiguriert). Ein toter Kanal soll automatisch auffallen.
// Siehe memory/HANDOFF-vercel-cleanup-remaining.md.
//
// ─── Go-Live-Sweep B7 (14.07.2026): ALARM-MASKIERUNG GEFIXT ─────────────────────
// `webhook_events` ist KEINE reine Inbound-Tabelle. `processLexDriveEvent` schreibt dort
// auch INTERNE Admin-Aktionen (manueller Status-Override, LexDrive-Trigger-Panel):
//
//   process-event.ts:735 → const source = input.source === 'manual' ? 'manual_admin' : 'lexdrive'
//
// Der Check las die Tabelle bisher UNGEFILTERT (nur order(created_at).limit(1)). Folge:
// jede ganz normale Admin-Aktion schrieb eine frische `manual_admin`-Zeile und setzte damit
// die „Inbound"-Uhr auf 0 — ein TOTER Rückkanal wurde als gesund gemeldet. Also eine
// FALSCHE ENTWARNUNG in genau dem Check, der den toten Kanal finden soll.
// (Schwesterfall B6/PR #4218: dort ein Fehlalarm, hier das Gegenteil — beide Male war die
// Check-Spezifikation der Bug, nicht die Integration.)
//
// Fix: pro Kanal optional auf die echte Inbound-Quelle filtern (`source='lexdrive'`).
// Matelso/Aircall haben dedizierte Landing-Tabellen ohne Fremd-Writer → kein Filter nötig.
//
// WICHTIG: Kein roh-SQL im .select() — max(created_at) via .order+.limit(1),
// Altersberechnung in JS. Jede Landing-Tabelle ist der natürliche Empfangs-
// Nachweis → kein Route-Change / Heartbeat nötig.

import type { HealthCheck, CheckResult } from '@/lib/health/types'

export type ChannelSilence = {
  id: string
  label: string
  /** Volle Tage seit dem letzten Inbound; null = noch nie empfangen. */
  tage: number | null
  warnTage: number
  critTage: number
}

// Kanäle + dedizierte Landing-Tabelle (created_at = letztes Inbound-Event).
// LexDrive: enger Takt (Kanzlei-Status). Matelso/Aircall: Call-Kanäle, gröberer Takt.
const CHANNELS: ReadonlyArray<{
  id: string
  label: string
  table: string
  /**
   * Nur ECHTE Inbound-Zeilen zählen. Zu setzen, wenn die Landing-Tabelle AUCH von internen
   * Pfaden beschrieben wird — sonst maskiert interne Aktivität einen toten Rückkanal.
   * `webhook_events` teilt sich die Tabelle mit `source='manual_admin'` (Admin-UI);
   * echter Inbound ist ausschließlich `source='lexdrive'`.
   */
  inboundSource?: string
  warnTage: number
  critTage: number
}> = [
  { id: 'lexdrive', label: 'LexDrive', table: 'webhook_events', inboundSource: 'lexdrive', warnTage: 7, critTage: 30 },
  { id: 'matelso', label: 'Matelso', table: 'matelso_calls', warnTage: 14, critTage: 45 },
  { id: 'aircall', label: 'Aircall', table: 'aircall_calls', warnTage: 14, critTage: 45 },
]

function classify(c: ChannelSilence): 'ok' | 'warn' | 'crit' {
  // Noch nie empfangen -> warn (ambig: dormant/unkonfiguriert vs tot). Kein crit,
  // damit ein legitim ruhiger Kanal nicht dauerhaft rot schreit.
  if (c.tage === null) return 'warn'
  if (c.tage > c.critTage) return 'crit'
  if (c.tage > c.warnTage) return 'warn'
  return 'ok'
}

/**
 * Reine Aggregation: worst-of-N Status über alle Kanäle + Detail-Zeile.
 * metric = Anzahl nicht-ok-Kanäle.
 */
export function evaluateWebhookSilence(channels: ChannelSilence[]): CheckResult {
  const rang = { ok: 0, warn: 1, crit: 2 } as const
  let worst: 'ok' | 'warn' | 'crit' = 'ok'
  let nichtOk = 0
  const teile: string[] = []

  for (const c of channels) {
    const s = classify(c)
    if (rang[s] > rang[worst]) worst = s
    if (s !== 'ok') nichtOk += 1
    const alter = c.tage === null ? 'nie' : `${c.tage} T`
    const marker = s === 'crit' ? ' ✗' : s === 'warn' ? ' ⚠' : ''
    teile.push(`${c.label}: ${alter}${marker}`)
  }

  return {
    status: worst,
    metric: nichtOk,
    detail:
      worst === 'ok'
        ? `Alle Inbound-Webhooks aktiv — ${teile.join(' · ')}`
        : `Inbound-Webhook-Stille — ${teile.join(' · ')} (Kanal + partner-seitige Webhook-URL prüfen)`,
  }
}

export const webhookInboundSilentCheck: HealthCheck = {
  id: 'webhook-inbound-silent',
  category: 'sends',
  title: 'Inbound-Webhook-Stille (LexDrive/Matelso/Aircall)',

  async run(ctx): Promise<CheckResult> {
    const channels: ChannelSilence[] = []
    for (const k of CHANNELS) {
      const base = ctx.supabase.from(k.table).select('created_at')
      // B7: nur echte Inbound-Zeilen — interne `manual_admin`-Writes dürfen die Uhr NICHT stellen.
      const query = k.inboundSource ? base.eq('source', k.inboundSource) : base

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1)

      if (error) {
        return { status: 'error', detail: `${k.label}: DB-Fehler beim Prüfen — ${error.message}` }
      }

      const rows = (data ?? []) as Array<{ created_at: string }>
      const tage =
        rows.length > 0
          ? Math.floor((Date.now() - new Date(rows[0].created_at).getTime()) / 86_400_000)
          : null

      channels.push({ id: k.id, label: k.label, tage, warnTage: k.warnTage, critTage: k.critTage })
    }

    return evaluateWebhookSilence(channels)
  },
}
