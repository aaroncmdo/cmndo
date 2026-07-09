import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '../types'
import { classifyOrchestratorHealth, orchestratorPipelineCheck } from './orchestrator-pipeline'

describe('classifyOrchestratorHealth', () => {
  it('ok bei gesundem Betrieb', () => {
    expect(
      classifyOrchestratorHealth({ offen: 5, letzterLaufVorStunden: 2, fehlerBeimLetztenLauf: false }).status,
    ).toBe('ok')
  })
  it('warn wenn seit >26h kein Lauf', () => {
    expect(
      classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 30, fehlerBeimLetztenLauf: false }).status,
    ).toBe('warn')
  })
  it('warn bei Rückstau offener Vorschläge (>50)', () => {
    expect(
      classifyOrchestratorHealth({ offen: 60, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: false }).status,
    ).toBe('warn')
  })
  it('crit bei Fehler im letzten Lauf', () => {
    expect(
      classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: true }).status,
    ).toBe('crit')
  })
})

// ── run(): quelle-scoped Rueckstau-Zaehlung ───────────────────────────────────
// Der Spine ai_claim_proposals ist geteilt (quelle orchestrator|copilot|aufsicht).
// Dieser Check beobachtet NUR die Orchestrator-Pipeline — copilot-/aufsicht-
// Vorschlaege duerfen den offen-Zaehler (und damit den >50-Rueckstau-Alarm) nicht
// verfaelschen. Fake-CheckCtx: der ai_claim_proposals-Count spiegelt die angewandten
// .eq()-Filter wider; cron_jobs_audit liefert einen frischen, fehlerfreien Lauf,
// damit der Check den offen-Zweig ueberhaupt erreicht.
function makeCtx(offenByQuelle: Record<string, number>): CheckCtx {
  const proposals = Object.entries(offenByQuelle).flatMap(([quelle, n]) =>
    Array.from({ length: n }, () => ({ status: 'offen', quelle })),
  )
  const supabase = {
    from(table: string) {
      if (table === 'ai_claim_proposals') {
        const filters: Array<[string, unknown]> = []
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters.push([col, val])
            return builder
          },
          then: (resolve: (v: { count: number; error: null }) => void) => {
            const count = proposals.filter((p) =>
              filters.every(([c, v]) => (p as Record<string, unknown>)[c] === v),
            ).length
            return resolve({ count, error: null })
          },
        }
        return builder
      }
      if (table === 'cron_jobs_audit') {
        const result = {
          data: { started_at: new Date().toISOString(), status: 'ok' },
          error: null,
        }
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve(result),
        }
        return builder
      }
      throw new Error(`unerwartete Tabelle: ${table}`)
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('orchestratorPipelineCheck.run — quelle-Scoping', () => {
  it('zaehlt NUR quelle=orchestrator (copilot/aufsicht leaken nicht in den Rueckstau)', async () => {
    // 45 orchestrator + 20 copilot offen. Ungescoped = 65 → faelschlich warn (>50).
    // Orchestrator-scoped = 45 → ok. Genau das Leck, das der Fix schliesst.
    const ctx = makeCtx({ orchestrator: 45, copilot: 20 })
    const result = await orchestratorPipelineCheck.run(ctx)
    expect(result.metric).toBe(45)
    expect(result.status).toBe('ok')
  })

  it('warnt weiterhin bei echtem Orchestrator-Rueckstau (>50 orchestrator-eigene)', async () => {
    // 60 orchestrator + 5 copilot. Scoped = 60 → warn (Rueckstau-Semantik bleibt intakt).
    const ctx = makeCtx({ orchestrator: 60, copilot: 5 })
    const result = await orchestratorPipelineCheck.run(ctx)
    expect(result.metric).toBe(60)
    expect(result.status).toBe('warn')
  })
})
