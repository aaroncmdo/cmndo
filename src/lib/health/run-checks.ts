// Runner: fuehrt alle registrierten Health-Checks parallel aus.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task6
//
// Pro Check: try/catch — ein fehlschlagender Check bricht die anderen NICHT ab.
// Result-Object, kein throw aus runAllChecks.
// Der `checks`-Parameter ist injizierbar (Default = ALL_CHECKS) fuer Tests.

import type { HealthCheck, CheckCtx, CheckResult } from '@/lib/health/types'
import { ALL_CHECKS } from '@/lib/health/checks/index'

export async function runAllChecks(
  ctx: CheckCtx,
  checks: HealthCheck[] = ALL_CHECKS,
): Promise<Array<{ check: HealthCheck; result: CheckResult }>> {
  return Promise.all(
    checks.map(async (c) => {
      let result: CheckResult
      try {
        result = await c.run(ctx)
      } catch (e) {
        result = {
          status: 'error',
          detail: e instanceof Error ? e.message : String(e),
        }
      }
      return { check: c, result }
    }),
  )
}
