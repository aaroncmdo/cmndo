import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeSlaRows, aggregiereSlaLage } from '@/lib/aufsicht/sla-rollen'
import { laufeSlaAufsicht } from '@/lib/aufsicht/synthese'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * KI-Aufsicht SLA-Cron.
 *
 * Laedt alle aktiven SLA-Zeilen, aggregiert sie zur SlaRollenLage,
 * ruft laufeSlaAufsicht (Claude Tool-Use) auf und persistiert
 * Remediation-Drafts in ai_claim_proposals (quelle='aufsicht').
 *
 * VPS-Crontab-Eintrag (Ops-Schritt post-Merge):
 *   0 8 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/ki-aufsicht-sla
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const rows = await ladeSlaRows()
    const lage = aggregiereSlaLage(rows, new Date())
    const { findings } = await laufeSlaAufsicht(lage)

    await supabase.rpc('log_cron_job_run', {
      p_job_name: 'ki-aufsicht-sla',
      p_status: 'success',
      p_rows: findings,
      p_metadata: {
        gesamt_breached: lage.gesamt.breached,
        gesamt_impending: lage.gesamt.impending,
        gesamt_pending: lage.gesamt.pending,
      },
    })

    return NextResponse.json({ ok: true, findings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ki-aufsicht-sla] Cron-Lauf fehlgeschlagen:', err)

    try {
      await supabase.rpc('log_cron_job_run', {
        p_job_name: 'ki-aufsicht-sla',
        p_status: 'error',
        p_error: msg,
      })
    } catch (logErr) {
      console.error('[ki-aufsicht-sla] log_cron_job_run fehlgeschlagen (geschluckt):', logErr)
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
