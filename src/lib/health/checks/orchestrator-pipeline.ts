// Health-Check: AI-Claim-Orchestrator-Pipeline
// Beobachtet den Shadow-Mode-Cron (claim-orchestrator):
//   - Rückstau offener KI-Vorschläge in ai_claim_proposals (kein Mensch entscheidet)
//   - Laufzeit-Lücke (kein Lauf seit >26h)
//   - Fehler im letzten Lauf (status='error' in cron_jobs_audit)
//
// cron_jobs_audit-Schema: job_name, started_at (Timestamp), status, error_message
// Read-only; braucht den service_role-Client.

import type { HealthCheck, CheckResult } from '../types'

export type OrchestratorStats = {
  offen: number
  letzterLaufVorStunden: number
  fehlerBeimLetztenLauf: boolean
}

export function classifyOrchestratorHealth(s: OrchestratorStats): CheckResult {
  if (s.fehlerBeimLetztenLauf) {
    return {
      status: 'crit',
      metric: s.offen,
      detail: 'Letzter Orchestrator-Lauf meldete einen Fehler.',
    }
  }
  if (s.letzterLaufVorStunden > 26) {
    return {
      status: 'warn',
      metric: s.letzterLaufVorStunden,
      detail: `Seit ${Math.round(s.letzterLaufVorStunden)}h kein Orchestrator-Lauf.`,
    }
  }
  if (s.offen > 50) {
    return {
      status: 'warn',
      metric: s.offen,
      detail: `${s.offen} offene KI-Vorschläge — Rückstau, niemand entscheidet.`,
    }
  }
  return {
    status: 'ok',
    metric: s.offen,
    detail: `${s.offen} offene Vorschläge, letzter Lauf vor ${Math.round(s.letzterLaufVorStunden)}h.`,
  }
}

export const orchestratorPipelineCheck: HealthCheck = {
  id: 'orchestrator-pipeline',
  category: 'cron',
  title: 'AI-Claim-Orchestrator',

  async run(ctx): Promise<CheckResult> {
    const { count: offen } = await ctx.supabase
      .from('ai_claim_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'offen')

    // Schema-Override (2026-07-05): Timestamp-Spalte ist started_at, nicht erstellt_am
    const { data: lauf } = await ctx.supabase
      .from('cron_jobs_audit')
      .select('started_at, status')
      .eq('job_name', 'claim-orchestrator')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const letzterLaufVorStunden =
      lauf?.started_at
        ? (Date.now() - new Date(lauf.started_at as string).getTime()) / 3600000
        : 999

    return classifyOrchestratorHealth({
      offen: offen ?? 0,
      letzterLaufVorStunden,
      fehlerBeimLetztenLauf: (lauf?.status as string | null) === 'error',
    })
  },
}
