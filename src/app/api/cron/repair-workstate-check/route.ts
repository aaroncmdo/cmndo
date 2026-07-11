// Reparatur-Workstate-Check-Cron (WS6 Slice 2, Teil 6): faehrt periodisch die drei
// Reparatur-Integritaets-Checks — erledigt_nicht_geschlossen (critical), keine_werkstatt_zugewiesen
// (warning), termin_ueberfaellig_nicht_erledigt (warning). Findings landen laut in den VPS-Logs
// (Prefix `[repair-workstate]`, JSON) und in der Response.
//
// Aktivierung: braucht einen VPS-crontab-Eintrag, z.B. stündlich:
//   0 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/repair-workstate-check
// Bis der Eintrag gesetzt ist, ist der Endpoint on-demand via Bearer-Auth aufrufbar (+ die Admin-Action
// `pruefeReparaturWorkstate` im Admin-Dashboard fuehrt dieselben Checks ohne Cron aus).
//
// Auth: assertCronAuth (fail-closed bei UNSET CRON_SECRET).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runReparaturWorkstateChecks } from '@/lib/werkstatt/repair-workstate-checks'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const report = await runReparaturWorkstateChecks(db)

  if (!report.ok) {
    // Workstate-Verletzung — laut loggen, damit VPS-Log-Monitoring anschlaegt.
    console.error(`[repair-workstate] ${report.findings.length} FINDING(S):`, JSON.stringify(report.findings))
  }

  return NextResponse.json({
    ok: report.ok,
    geprueft: report.geprueft,
    findings_count: report.findings.length,
    findings: report.findings,
  })
}
