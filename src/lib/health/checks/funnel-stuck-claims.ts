// Health-Check: Funnel-Stuck-Claims
// Erkennt aktive Claims, die laenger als ihre Phasen-SLA im selben operativen Status
// feststecken. Read-only auf claims.operative_status + status_changed_at.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task2

import type { HealthCheck, CheckResult } from '@/lib/health/types'
import { TERMINAL_PHASES, slaTage } from '@/lib/health/phase-slas'

// Schwellwerte fuer Statuswechsel
const CRIT_COUNT_THRESHOLD = 10 // >= 10 Claims ueber SLA -> crit
const CRIT_AGE_MULTIPLIER = 2 // aeltester > 2x SLA -> crit

type ClaimRow = {
  id: string
  operative_status: string
  status_changed_at: string
}

export const funnelStuckClaimsCheck: HealthCheck = {
  id: 'funnel-stuck-claims',
  category: 'funnel',
  title: 'Feststeckende Claims im Funnel',

  async run(ctx): Promise<CheckResult> {
    // Alle aktiven (nicht-terminalen) Claims laden
    const terminalList = Array.from(TERMINAL_PHASES).join(',')
    const { data, error } = await ctx.supabase
      .from('claims')
      .select('id, operative_status, status_changed_at')
      .not('operative_status', 'in', `(${terminalList})`)

    if (error) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Laden der Claims: ${error.message}`,
      }
    }

    const rows: ClaimRow[] = (data ?? []) as ClaimRow[]

    if (rows.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine aktiven Claims vorhanden.' }
    }

    const now = Date.now()

    // Pro Phase: Claims ausfindig machen die ueber SLA liegen
    const phaseSummary: Map<
      string,
      { total: number; ueberSla: number; aeltesterTage: number; slaIds: string[] }
    > = new Map()

    for (const row of rows) {
      const phase = row.operative_status
      const sla = slaTage(phase)
      const ageTage = (now - new Date(row.status_changed_at).getTime()) / 86_400_000

      if (!phaseSummary.has(phase)) {
        phaseSummary.set(phase, { total: 0, ueberSla: 0, aeltesterTage: 0, slaIds: [] })
      }
      const entry = phaseSummary.get(phase)!
      entry.total++

      if (ageTage > entry.aeltesterTage) {
        entry.aeltesterTage = Math.round(ageTage)
      }

      if (ageTage > sla) {
        entry.ueberSla++
        entry.slaIds.push(row.id)
      }
    }

    // Aggregate-Metriken
    let totalUeberSla = 0
    let maxAlterTageRel = 0 // Wie viele Tage UEBER dem SLA-Limit
    let worsePhaseName = ''
    const sampleIds: string[] = []

    for (const [phase, entry] of phaseSummary) {
      totalUeberSla += entry.ueberSla
      const sla = slaTage(phase)
      const ueberLimit = entry.aeltesterTage - sla
      if (entry.ueberSla > 0 && ueberLimit > maxAlterTageRel) {
        maxAlterTageRel = ueberLimit
        worsePhaseName = phase
        // Bis zu 5 Sample-IDs aus der schlechtesten Phase
        sampleIds.splice(0, sampleIds.length, ...entry.slaIds.slice(0, 5))
      }
    }

    if (totalUeberSla === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${rows.length} aktiven Claims innerhalb ihrer Phasen-SLA.`,
      }
    }

    // Detail-Text aufbauen
    const phaseLines = Array.from(phaseSummary.entries())
      .filter(([, e]) => e.ueberSla > 0)
      .map(([phase, e]) => `${phase}: ${e.ueberSla}/${e.total} über SLA (ältester ${e.aeltesterTage}d)`)
      .join('; ')

    const detail = `${totalUeberSla} Claims über SLA — ${phaseLines}`

    // Criticality-Regeln:
    // crit wenn >= CRIT_COUNT_THRESHOLD ueber SLA
    // crit wenn aeltester > 2x SLA seiner Phase
    const isCritByCount = totalUeberSla >= CRIT_COUNT_THRESHOLD
    const isCritByAge = (() => {
      for (const [phase, entry] of phaseSummary) {
        if (entry.ueberSla > 0 && entry.aeltesterTage > CRIT_AGE_MULTIPLIER * slaTage(phase)) {
          return true
        }
      }
      return false
    })()

    const status = isCritByCount || isCritByAge ? 'crit' : 'warn'

    return {
      status,
      metric: totalUeberSla,
      detail,
      sampleIds: sampleIds.length > 0 ? sampleIds : undefined,
    }
  },
}
