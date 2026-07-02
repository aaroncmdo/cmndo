import { NextResponse } from 'next/server'
import { runGoldenPath } from '@/lib/health/golden-path'
import { recordFailedOperation, markOperationResolved } from '@/lib/reliability/dead-letter'

export const dynamic = 'force-dynamic'

/**
 * Golden-Path E2E-Harness (Spec 2026-07-02): treibt einen synthetischen Fall durch die
 * echte Kern-Pipeline + Rollen-Sicht-Assertions, raeumt danach hart auf.
 *
 * Doppelnutzung: manueller curl (sofortiges "was bricht") + nightly VPS-Crontab.
 * Bei Fehler -> Dead-Letter (recovery-monitor eskaliert an Admins); bei Erfolg -> resolved.
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await runGoldenPath()
  const DEDUP = 'golden-path-daily'

  if (!report.ok) {
    const failed = report.stages.find((s) => !s.ok)
    await recordFailedOperation({
      operationType: 'golden_path',
      dedupKey: DEDUP,
      error: `Stufe '${failed?.stage ?? '?'}': ${failed?.detail ?? 'unbekannt'}`,
      payload: { stages: report.stages, fallId: report.fallId, claimId: report.claimId, cleanedUp: report.cleanedUp },
    })
  } else {
    await markOperationResolved(DEDUP)
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 })
}
