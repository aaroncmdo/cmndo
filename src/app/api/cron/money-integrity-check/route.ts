// Money-Integrity-Check-Cron — faehrt das operationalisierte Money-Model-Audit (Session 6f60c510)
// periodisch: USt-Tripel-Konsistenz + §14-Beleg-Reconciliation + Ledger-Cache-Drift. Findings landen
// laut in den VPS-Logs (Prefix `[money-integrity]`, JSON) und in der Response.
//
// Aktivierung: braucht einen VPS-crontab-Eintrag (wie die uebrigen Crons), z.B. taeglich 03:00 UTC:
//   0 3 * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/money-integrity-check
// Bis der Eintrag gesetzt ist, ist der Endpoint on-demand via Bearer-Auth aufrufbar (+ die Admin-Action
// `pruefeMoneyIntegritaet` im Finance-Hub fuehrt dieselben Checks ohne Cron aus).
//
// Follow-up (optional): aktives Push-Alerting (Slack/Email/Admin-Mitteilung) statt nur Log — sobald
// echter Money-Traffic laeuft. Detektion + Report sind hier vollstaendig; nur der Push-Kanal fehlt.
//
// Auth: Bearer-Token via CRON_SECRET.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMoneyIntegrityChecks } from '@/lib/finance/money-integrity-checks'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const report = await runMoneyIntegrityChecks(db)

  if (!report.ok) {
    // Money-Integritaets-Verletzung — laut loggen, damit VPS-Log-Monitoring anschlaegt.
    console.error(`[money-integrity] ${report.findings.length} FINDING(S):`, JSON.stringify(report.findings))
  }

  return NextResponse.json({
    ok: report.ok,
    geprueft: report.geprueft,
    findings_count: report.findings.length,
    findings: report.findings,
  })
}
