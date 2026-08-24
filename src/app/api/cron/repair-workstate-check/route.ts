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
import { meldeFindingsAlsTask } from '@/lib/watchdog/finding-task'

export const dynamic = 'force-dynamic'

const TASK_CODE = 'repair-workstate-finding'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const report = await runReparaturWorkstateChecks(db)

  let taskAngelegt = false
  if (!report.ok) {
    // Workstate-Verletzung — laut loggen, damit VPS-Log-Monitoring anschlaegt.
    console.error(`[repair-workstate] ${report.findings.length} FINDING(S):`, JSON.stringify(report.findings))

    // ⭐ Das Log allein reicht NICHT: Die Route antwortet auch mit Findings HTTP 200,
    // `cron-call.sh` loggt dann „ok http=200" und der Fund bleibt unbemerkt.
    const ergebnis = await meldeFindingsAlsTask(db, {
      taskCode: TASK_CODE,
      titel: `${report.findings.length} Reparatur-Workstate-Verletzung(en)`,
      einleitung:
        'Reparatur-Vorgaenge stehen in einem Zustand, den der operative Ablauf nicht vorsieht ' +
        '(z. B. Termin lange vorbei, aber nie als erledigt gesetzt). Solche Faelle bleiben ' +
        'liegen, ohne dass jemand sie in einer Liste sieht.',
      zeilen: report.findings.map((f) => `${f.check} (${f.severity}, ${f.count}×): ${f.detail}`),
      prioritaet: report.findings.some((f) => f.severity === 'critical') ? 'kritisch' : 'dringend',
    })
    taskAngelegt = ergebnis.angelegt
  }

  return NextResponse.json({
    ok: report.ok,
    geprueft: report.geprueft,
    findings_count: report.findings.length,
    findings: report.findings,
    task_angelegt: taskAngelegt,
  })
}
