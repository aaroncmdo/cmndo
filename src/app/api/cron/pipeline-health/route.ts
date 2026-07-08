import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAllChecks } from '@/lib/health/run-checks'
import { persistAndAlert } from '@/lib/health/persist-and-alert'
import { STATUS_RANK } from '@/lib/health/types'
import type { HealthStatus } from '@/lib/health/types'

export const dynamic = 'force-dynamic'

/**
 * Pipeline-Health-Cron.
 *
 * Laeuft regelmaessig (VPS-Crontab, z.B. stuendlich) und fuehrt alle registrierten
 * Health-Checks durch. Ergebnisse werden in health_check_runs persistiert; bei
 * Verschlechterung oder anhaltendem CRIT werden Admins alarmiert.
 *
 * VPS-Crontab-Eintrag (Aaron) — stuendlich:
 *   0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/pipeline-health
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const results = await runAllChecks({ supabase })
    await persistAndAlert({ supabase }, results)

    // Schlechtesten Status ermitteln (ok < warn < error = crit).
    let worstStatus: HealthStatus = 'ok'
    for (const { result } of results) {
      if (STATUS_RANK[result.status] > STATUS_RANK[worstStatus]) {
        worstStatus = result.status
      }
    }

    await supabase.rpc('log_cron_job_run', {
      p_job_name: 'pipeline-health',
      p_status: 'success',
      p_rows: results.length,
      p_metadata: { worst: worstStatus },
    })

    return Response.json({
      ok: true,
      summary: results.map((r) => ({ id: r.check.id, status: r.result.status })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline-health] Cron-Lauf fehlgeschlagen:', err)

    try {
      await supabase.rpc('log_cron_job_run', {
        p_job_name: 'pipeline-health',
        p_status: 'error',
        p_error: msg,
      })
    } catch (logErr) {
      console.error('[pipeline-health] log_cron_job_run fehlgeschlagen (geschluckt):', logErr)
    }

    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
