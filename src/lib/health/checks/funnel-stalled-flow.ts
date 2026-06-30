// Health-Check: Funnel-Stalled-Flow
// Erkennt Fluss-Blockaden im Meilenstein-Trichter: ein Meilenstein ohne Claims,
// waehrend ein vorgelagerter Meilenstein >= MIN_UPSTREAM Claims seit >14 Tagen haelt.
// Read-only auf v_claim_phase (main_phase) + claims.status_changed_at.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task2

import type { HealthCheck, CheckResult, HealthStatus } from '@/lib/health/types'

// Kanonische Meilenstein-Reihenfolge (grob, vom fruehesten zum spaetesten)
const MILESTONES = ['erfassung', 'begutachtung', 'regulierung', 'abschluss'] as const
type Milestone = (typeof MILESTONES)[number]

// Minimale Upstream-Claims-Anzahl bevor ein Wall gemeldet wird
const MIN_UPSTREAM = 5

// Alter in Tagen ab dem ein upstream-gesteckter Claim als "gealtert" gilt
const STALE_TAGE = 14

// Meilensteine die bei einer Wall-Situation "crit" statt "warn" ausloesen
const CRIT_MILESTONES: Milestone[] = ['regulierung', 'abschluss']

export const funnelStalledFlowCheck: HealthCheck = {
  id: 'funnel-stalled-flow',
  category: 'funnel',
  title: 'Meilenstein-Fluss blockiert',

  async run(ctx): Promise<CheckResult> {
    // 1. Verteilung je main_phase aus v_claim_phase lesen
    const { data: viewData, error: viewError } = await ctx.supabase
      .from('v_claim_phase')
      .select('main_phase, claim_id')

    if (viewError) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Laden von v_claim_phase: ${viewError.message}`,
      }
    }

    const rows = (viewData ?? []) as { main_phase: string; claim_id: string }[]

    if (rows.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine aktiven Claims in v_claim_phase.' }
    }

    // 2. Claim-IDs je Meilenstein gruppieren
    const claimsByMilestone: Map<string, string[]> = new Map()
    for (const r of rows) {
      if (!claimsByMilestone.has(r.main_phase)) claimsByMilestone.set(r.main_phase, [])
      claimsByMilestone.get(r.main_phase)!.push(r.claim_id)
    }

    // 3. Alter aller referenzierten Claims laden
    const allClaimIds = rows.map((r) => r.claim_id)
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id, status_changed_at')
      .in('id', allClaimIds)

    if (claimError) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Laden von claims: ${claimError.message}`,
      }
    }

    const claimAge: Map<string, number> = new Map()
    const now = Date.now()
    for (const c of (claimData ?? []) as { id: string; status_changed_at: string }[]) {
      const ageTage = (now - new Date(c.status_changed_at).getTime()) / 86_400_000
      claimAge.set(c.id, ageTage)
    }

    // 4. Pro Meilenstein-Paar pruefen ob ein "Wall" vorliegt
    // Wall = Meilenstein[i] hat 0 Claims, Meilenstein[i-1] hat >= MIN_UPSTREAM Claims
    // die alle > STALE_TAGE alt sind
    let worstStatus: HealthStatus = 'ok'
    const wallMessages: string[] = []

    for (let i = 1; i < MILESTONES.length; i++) {
      const current = MILESTONES[i]
      const upstream = MILESTONES[i - 1]

      const currentCount = claimsByMilestone.get(current)?.length ?? 0
      const upstreamIds = claimsByMilestone.get(upstream) ?? []

      // Wie viele upstream Claims sind gealtert?
      const gealtert = upstreamIds.filter((id) => (claimAge.get(id) ?? 0) > STALE_TAGE)

      if (currentCount === 0 && gealtert.length >= MIN_UPSTREAM) {
        // Wall erkannt
        const isCrit = (CRIT_MILESTONES as string[]).includes(current)
        const newStatus: HealthStatus = isCrit ? 'crit' : 'warn'

        if (newStatus === 'crit' || worstStatus !== 'crit') {
          worstStatus = newStatus
        }

        wallMessages.push(
          `Fluss versiegt: 0 in ${current}, aber ${gealtert.length} gealterte Upstream (${upstream} >${STALE_TAGE}d)`,
        )
      }
    }

    if (worstStatus === 'ok') {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Meilenstein-Fluss normal — alle Stufen besetzt oder Upstream unter Schwelle.',
      }
    }

    return {
      status: worstStatus,
      metric: wallMessages.length,
      detail: wallMessages.join(' | '),
    }
  },
}
